import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PersistenceError } from '../errors';
import { DEFAULT_STORAGE_KEY, LocalStorageRepository } from '../LocalStorageRepository';
import { createDependencies, makeDraft, MemoryStorage } from './helpers';
import { describeRepositoryContract } from './repositoryContract';

describeRepositoryContract(
  'LocalStorageRepository',
  (dependencies) => new LocalStorageRepository({ ...dependencies, storage: new MemoryStorage() }),
);

describe('LocalStorageRepository', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  function createRepository(onRecover = vi.fn()) {
    return new LocalStorageRepository({ ...createDependencies(), storage, onRecover });
  }

  function storedSnapshot(): unknown {
    return JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY) ?? 'null');
  }

  it('does not touch storage until first used', () => {
    storage.failOnGet = new Error('should not be read');
    expect(() => createRepository()).not.toThrow();
  });

  it('writes a versioned snapshot after each mutation', async () => {
    const project = await createRepository().create(makeDraft());

    expect(storedSnapshot()).toMatchObject({ schemaVersion: 1, projects: [project] });
  });

  it('persists data across instances', async () => {
    const created = await createRepository().create(makeDraft());

    await expect(createRepository().list()).resolves.toEqual([created]);
  });

  it('uses a custom storage key', async () => {
    const repository = new LocalStorageRepository({ storage, key: 'custom' });
    await repository.create(makeDraft());

    expect(storage.keys()).toEqual(['custom']);
  });

  describe('recovery', () => {
    it.each([
      ['invalid JSON', '{not json', 'corrupted'],
      [
        'an invalid project',
        JSON.stringify({ schemaVersion: 1, exportedAt: 'x', projects: [{}] }),
        'corrupted',
      ],
      [
        'a newer schema version',
        JSON.stringify({ schemaVersion: 99, projects: [] }),
        'unsupported-version',
      ],
    ])('backs up %s and starts empty', async (_label, raw, reason) => {
      storage.setItem(DEFAULT_STORAGE_KEY, raw);
      const onRecover = vi.fn();

      await expect(createRepository(onRecover).list()).resolves.toEqual([]);

      expect(onRecover).toHaveBeenCalledOnce();
      const [error, backupKey] = onRecover.mock.calls[0] as [PersistenceError, string];
      expect(error).toBeInstanceOf(PersistenceError);
      expect(error.reason).toBe(reason);
      expect(backupKey).toMatch(/^horizon-planner:data:backup:/);
      expect(storage.getItem(backupKey)).toBe(raw);
    });

    it('keeps the corrupted value until the next successful write', async () => {
      storage.setItem(DEFAULT_STORAGE_KEY, '{not json');
      const repository = createRepository();

      await repository.list();
      expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBe('{not json');

      await repository.create(makeDraft());
      expect(storedSnapshot()).toMatchObject({ schemaVersion: 1 });
    });
  });

  describe('failures', () => {
    it('rejects with "unavailable" when storage cannot be read', async () => {
      storage.failOnGet = new Error('SecurityError');

      await expect(createRepository().list()).rejects.toMatchObject({
        name: 'PersistenceError',
        reason: 'unavailable',
      });
    });

    it('rolls back and rejects with "quota-exceeded" when storage is full', async () => {
      const repository = createRepository();
      const existing = await repository.create(makeDraft({ title: 'Existente' }));

      storage.failOnSet = new DOMException('Full', 'QuotaExceededError');

      await expect(repository.create(makeDraft({ title: 'Novo' }))).rejects.toMatchObject({
        reason: 'quota-exceeded',
      });
      await expect(repository.update(existing.id, { progress: 90 })).rejects.toMatchObject({
        reason: 'quota-exceeded',
      });
      await expect(repository.list()).resolves.toEqual([existing]);
    });

    it('rejects with "unavailable" on other write errors', async () => {
      const repository = createRepository();
      storage.failOnSet = new Error('Disk error');

      await expect(repository.create(makeDraft())).rejects.toMatchObject({
        reason: 'unavailable',
      });
    });
  });
});

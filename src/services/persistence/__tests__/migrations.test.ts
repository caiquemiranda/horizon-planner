import { describe, expect, it, vi } from 'vitest';

import { PersistenceError, ProjectValidationError } from '../errors';
import { InMemoryRepository } from '../InMemoryRepository';
import { migrateSnapshot } from '../migrations';
import { createDependencies, makeDraft } from './helpers';

async function validSnapshot() {
  const repository = new InMemoryRepository([], createDependencies());
  const project = await repository.create(makeDraft());
  return { schemaVersion: 1, exportedAt: '2026-11-21T12:00:00.000Z', projects: [project] };
}

describe('migrateSnapshot', () => {
  it('returns a current-version snapshot unchanged', async () => {
    const snapshot = await validSnapshot();
    expect(migrateSnapshot(snapshot)).toEqual(snapshot);
  });

  it.each([null, 'text', 42, []])('rejects non-object data: %j', (raw) => {
    expect(() => migrateSnapshot(raw)).toThrow(expect.objectContaining({ reason: 'corrupted' }));
  });

  it.each([undefined, '1', 0, 1.5])('rejects an invalid schemaVersion: %j', (schemaVersion) => {
    expect(() => migrateSnapshot({ schemaVersion, projects: [] })).toThrow(
      expect.objectContaining({ reason: 'corrupted' }),
    );
  });

  it('rejects data from a newer app version', () => {
    expect(() => migrateSnapshot({ schemaVersion: 2, projects: [] })).toThrow(
      expect.objectContaining({ reason: 'unsupported-version' }),
    );
  });

  it('wraps validation errors with their cause', async () => {
    const snapshot = await validSnapshot();
    const broken = { ...snapshot, projects: [{ ...snapshot.projects[0], progress: 500 }] };

    let thrown: unknown;
    try {
      migrateSnapshot(broken);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PersistenceError);
    expect(thrown).toMatchObject({ reason: 'corrupted' });
    expect((thrown as PersistenceError).cause).toBeInstanceOf(ProjectValidationError);
  });

  describe('migration chain', () => {
    it('applies migrations in order from the stored version', async () => {
      const snapshot = await validSnapshot();
      const calls: number[] = [];
      const migrations = {
        1: vi.fn((data: Record<string, unknown>) => {
          calls.push(1);
          return { ...data, schemaVersion: 2 };
        }),
        2: vi.fn((data: Record<string, unknown>) => {
          calls.push(2);
          return { ...data, schemaVersion: 3 };
        }),
      };

      // The current schema only validates v1, so the final validation fails on purpose:
      // this test only asserts the order in which migrations run.
      expect(() => migrateSnapshot(snapshot, migrations, 3)).toThrow();
      expect(calls).toEqual([1, 2]);
    });

    it('fails when a migration step is missing', () => {
      expect(() => migrateSnapshot({ schemaVersion: 1 }, {}, 2)).toThrow(
        expect.objectContaining({ reason: 'unsupported-version' }),
      );
    });

    it('fails when a migration does not bump the version', () => {
      const migrations = { 1: (data: Record<string, unknown>) => data };

      expect(() => migrateSnapshot({ schemaVersion: 1 }, migrations, 2)).toThrow(
        expect.objectContaining({ reason: 'corrupted' }),
      );
    });
  });
});

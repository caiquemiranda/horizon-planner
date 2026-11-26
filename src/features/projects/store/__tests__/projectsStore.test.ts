import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InMemoryRepository,
  PersistenceError,
  type ProjectRepository,
} from '@/services/persistence';
import { createDependencies, makeDraft } from '@/services/persistence/__tests__/helpers';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { createProjectsStore, describeError, type ProjectsStore } from '../projectsStore';

let repository: ProjectRepository;
let store: ProjectsStore;

async function seed(count = 2) {
  for (let index = 0; index < count; index += 1) {
    await repository.create(makeDraft({ title: `Projeto ${String(index + 1)}` }));
  }
  await store.getState().load();
  return store.getState().projects;
}

describe('projectsStore and sample projects', () => {
  beforeEach(() => {
    repository = new InMemoryRepository([], createDependencies());
    store = createProjectsStore(repository, { now: () => new Date('2026-05-01T10:00:00.000Z') });
  });

  it('replaces only the samples and keeps them read-only', async () => {
    const [own] = await seed(1);
    const sample = makeProject({
      id: 'e0000000-0000-4000-8000-000000000009',
      title: 'Exemplo',
      demo: true,
    });
    await store.getState().replaceExamples([sample]);
    await store.getState().replaceExamples([sample]);
    expect((await repository.list()).map((project) => project.title)).toEqual([
      own?.title,
      'Exemplo',
    ]);

    await store.getState().update(sample.id, { title: 'Mudado' });
    await store.getState().hide(sample.id);
    await store.getState().moveToTrash(sample.id);
    await expect(
      store.getState().transition(sample.id, { action: 'start', date: '2026-05-01' as ISODate }),
    ).rejects.toThrow('Projetos de exemplo não mudam de status.');
    expect(await repository.get(sample.id)).toMatchObject({
      title: 'Exemplo',
      hiddenAt: null,
      deletedAt: null,
      demo: true,
    });

    await store.getState().replaceExamples([]);
    expect((await repository.list()).map((project) => project.title)).toEqual([own?.title]);
  });
});

describe('projectsStore', () => {
  beforeEach(() => {
    repository = new InMemoryRepository([], createDependencies());
    store = createProjectsStore(repository, { now: () => new Date('2026-05-01T10:00:00.000Z') });
  });

  it('loads projects from the repository', async () => {
    expect(store.getState().status).toBe('idle');
    const projects = await seed();

    expect(store.getState().status).toBe('ready');
    expect(projects.map((project) => project.title)).toEqual(['Projeto 1', 'Projeto 2']);
  });

  it('reports load failures', async () => {
    vi.spyOn(repository, 'list').mockRejectedValueOnce(
      new PersistenceError('unavailable', 'blocked'),
    );
    await store.getState().load();

    expect(store.getState().status).toBe('error');
    expect(store.getState().error).toMatch(/Não foi possível/);
  });

  it('creates a project and appends it', async () => {
    await store.getState().load();
    const created = await store.getState().create(makeDraft({ title: 'Novo' }));

    expect(store.getState().projects).toEqual([created]);
    await expect(repository.get(created.id)).resolves.toEqual(created);
  });

  it('rejects invalid drafts and exposes the validation message', async () => {
    await store.getState().load();
    const invalid = makeDraft({
      startDate: '2026-05-10' as ISODate,
      endDate: '2026-05-01' as ISODate,
    });

    await expect(store.getState().create(invalid)).rejects.toThrow();
    expect(store.getState().error).toBeTruthy();
    expect(store.getState().projects).toEqual([]);
  });

  it('applies updates optimistically, before persistence finishes', async () => {
    const [first] = await seed(1);
    if (!first) throw new Error('seed failed');

    const pending = store.getState().update(first.id, { title: 'Renomeado', progress: 40 });
    // Visible synchronously: this is what keeps the timeline in sync while typing.
    expect(store.getState().projects[0]).toMatchObject({ title: 'Renomeado', progress: 40 });

    await pending;
    await expect(repository.get(first.id)).resolves.toMatchObject({ title: 'Renomeado' });
  });

  it('rolls back to the repository state when an update fails', async () => {
    const [first] = await seed(1);
    if (!first) throw new Error('seed failed');

    await store.getState().update(first.id, {
      startDate: '2026-12-01' as ISODate,
      endDate: '2026-01-01' as ISODate,
    });

    expect(store.getState().projects[0]).toEqual(first);
    expect(store.getState().error).toBeTruthy();
  });

  it('removes the data that belongs to a deleted project, only when deleted', async () => {
    const onRemoved = vi.fn(() => Promise.resolve());
    store = createProjectsStore(repository, { onRemoved });
    const [first, second] = await seed();
    if (!first || !second) throw new Error('seed failed');

    await store.getState().moveToTrash(first.id);
    await store.getState().deletePermanently(first.id);
    expect(onRemoved).toHaveBeenCalledWith(first.id);

    await store.getState().moveToTrash(second.id);
    vi.spyOn(repository, 'remove').mockRejectedValueOnce(new PersistenceError('unavailable', 'x'));
    await store.getState().deletePermanently(second.id);
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it('deletes permanently from the trash only, and restores on failure', async () => {
    const [first, second] = await seed(2);
    if (!first || !second) throw new Error('seed failed');

    // Not in the trash: nothing happens.
    await store.getState().deletePermanently(first.id);
    expect(store.getState().projects.map((project) => project.id)).toEqual([first.id, second.id]);

    await store.getState().moveToTrash(first.id);
    await store.getState().deletePermanently(first.id);
    expect(store.getState().projects.map((project) => project.id)).toEqual([second.id]);
    await expect(repository.get(first.id)).resolves.toBeNull();

    await store.getState().moveToTrash(second.id);
    vi.spyOn(repository, 'remove').mockRejectedValueOnce(
      new PersistenceError('unavailable', 'blocked'),
    );
    await store.getState().deletePermanently(second.id);
    expect(store.getState().projects.map((project) => project.id)).toEqual([second.id]);
  });

  describe('visibility and trash', () => {
    const NOW = '2026-05-01T10:00:00.000Z';

    async function stored(id: string) {
      const project = await repository.get(id);
      if (!project) throw new Error('missing');
      return project;
    }

    it('hides and unhides without touching status, dates or progress', async () => {
      const [first] = await seed(1);
      if (!first) throw new Error('seed failed');

      await store.getState().hide(first.id);
      expect(store.getState().projects[0]?.hiddenAt).toBe(NOW);
      const hidden = await stored(first.id);
      expect(hidden.hiddenAt).toBe(NOW);
      expect(hidden).toMatchObject({
        status: first.status,
        startDate: first.startDate,
        endDate: first.endDate,
        progress: first.progress,
        lifecycle: first.lifecycle,
        deletedAt: null,
      });

      await store.getState().unhide(first.id);
      expect((await stored(first.id)).hiddenAt).toBeNull();
    });

    it('trashes and restores, keeping the hidden flag', async () => {
      const [first] = await seed(1);
      if (!first) throw new Error('seed failed');

      await store.getState().hide(first.id);
      await store.getState().moveToTrash(first.id);
      expect(await stored(first.id)).toMatchObject({ hiddenAt: NOW, deletedAt: NOW });

      await store.getState().restore(first.id);
      expect(await stored(first.id)).toMatchObject({ hiddenAt: NOW, deletedAt: null });
    });

    it('ignores repeated actions (a double click changes nothing more)', async () => {
      const [first] = await seed(1);
      if (!first) throw new Error('seed failed');
      const update = vi.spyOn(repository, 'update');

      await store.getState().moveToTrash(first.id);
      await store.getState().moveToTrash(first.id);
      await store.getState().restore(first.id);
      await store.getState().restore(first.id);
      expect(update).toHaveBeenCalledTimes(2);
    });

    it('keeps visibility out of field updates', async () => {
      const [first] = await seed(1);
      if (!first) throw new Error('seed failed');
      const patch = { title: 'Novo', deletedAt: NOW, hiddenAt: NOW } as unknown as Parameters<
        ReturnType<typeof store.getState>['update']
      >[1];

      await store.getState().update(first.id, patch);
      expect(await stored(first.id)).toMatchObject({
        title: 'Novo',
        hiddenAt: null,
        deletedAt: null,
      });
    });
  });

  it('replaces every project after persisting them', async () => {
    const [first, second] = await seed(2);
    if (!first || !second) throw new Error('seed failed');
    const renamed = { ...second, title: 'Importado' };

    await store.getState().replaceAll([renamed]);

    expect(store.getState().projects).toEqual([renamed]);
    await expect(repository.list()).resolves.toEqual([renamed]);
  });

  it('keeps the current projects when replacing fails', async () => {
    const projects = await seed(1);
    vi.spyOn(repository, 'replaceAll').mockRejectedValueOnce(
      new PersistenceError('quota-exceeded', 'full'),
    );

    await expect(store.getState().replaceAll([])).rejects.toThrow('full');

    expect(store.getState().projects).toEqual(projects);
    expect(store.getState().error).toMatch(/espaço/);
  });

  it('clears the error', () => {
    store.setState({ error: 'Falhou' });
    store.getState().clearError();
    expect(store.getState().error).toBeNull();
  });
});

describe('describeError', () => {
  it('explains a full storage', () => {
    expect(describeError(new PersistenceError('quota-exceeded', 'full'))).toMatch(/espaço/);
  });

  it('falls back to a generic message', () => {
    expect(describeError(new Error('boom'))).toMatch(/Não foi possível salvar/);
  });
});

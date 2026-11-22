import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InMemoryRepository,
  PersistenceError,
  type ProjectRepository,
} from '@/services/persistence';
import { createDependencies, makeDraft } from '@/services/persistence/__tests__/helpers';
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

  it('removes optimistically and restores on failure', async () => {
    const [first, second] = await seed(2);
    if (!first || !second) throw new Error('seed failed');

    await store.getState().remove(first.id);
    expect(store.getState().projects).toEqual([second]);

    vi.spyOn(repository, 'remove').mockRejectedValueOnce(
      new PersistenceError('unavailable', 'blocked'),
    );
    await store.getState().remove(second.id);
    expect(store.getState().projects).toEqual([second]);
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

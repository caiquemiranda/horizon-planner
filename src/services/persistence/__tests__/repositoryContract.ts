import { beforeEach, describe, expect, it } from 'vitest';

import type { ISODate } from '@/types/project';

import { ProjectNotFoundError, ProjectValidationError } from '../errors';
import type { RepositoryDependencies } from '../InMemoryRepository';
import type { ProjectRepository } from '../ProjectRepository';
import { createDependencies, makeDraft } from './helpers';

const MISSING_ID = '00000000-0000-4000-8000-999999999999';

/**
 * Behavior every `ProjectRepository` implementation must satisfy.
 * Run it once per implementation to guarantee they are interchangeable.
 */
export function describeRepositoryContract(
  name: string,
  createRepository: (dependencies: Required<RepositoryDependencies>) => ProjectRepository,
): void {
  describe(`${name} (repository contract)`, () => {
    let repository: ProjectRepository;

    beforeEach(() => {
      repository = createRepository(createDependencies());
    });

    it('starts empty', async () => {
      await expect(repository.list()).resolves.toEqual([]);
    });

    describe('create', () => {
      it('generates id, sort order and timestamps', async () => {
        const project = await repository.create(makeDraft());

        expect(project).toMatchObject({
          id: '00000000-0000-4000-8000-000000000001',
          title: 'Aprender piano',
          sortOrder: 0,
          createdAt: project.updatedAt,
        });
        await expect(repository.get(project.id)).resolves.toEqual(project);
      });

      it('normalizes input through the schema', async () => {
        const project = await repository.create(makeDraft({ title: '  Piano  ', category: ' ' }));
        expect(project.title).toBe('Piano');
        expect(project.category).toBeNull();
      });

      it('increments the sort order per horizon', async () => {
        const first = await repository.create(makeDraft({ horizon: 'short' }));
        const second = await repository.create(makeDraft({ horizon: 'short' }));
        const other = await repository.create(makeDraft({ horizon: 'long' }));

        expect([first.sortOrder, second.sortOrder, other.sortOrder]).toEqual([0, 1, 0]);
      });

      it('rejects invalid drafts without storing them', async () => {
        const draft = makeDraft({ endDate: '2026-01-01' as ISODate });

        await expect(repository.create(draft)).rejects.toBeInstanceOf(ProjectValidationError);
        await expect(repository.list()).resolves.toEqual([]);
      });
    });

    describe('get', () => {
      it('returns null for an unknown id', async () => {
        await expect(repository.get(MISSING_ID)).resolves.toBeNull();
      });
    });

    describe('update', () => {
      it('merges the patch and refreshes updatedAt only', async () => {
        const created = await repository.create(makeDraft());
        const updated = await repository.update(created.id, {
          progress: 60,
          status: 'in_progress',
        });

        expect(updated).toMatchObject({
          progress: 60,
          status: 'in_progress',
          title: created.title,
        });
        expect(updated.createdAt).toBe(created.createdAt);
        expect(updated.updatedAt > created.updatedAt).toBe(true);
        await expect(repository.get(created.id)).resolves.toEqual(updated);
      });

      it('never lets a patch change identity or audit fields', async () => {
        const created = await repository.create(makeDraft());
        const patch = { title: 'Novo', id: MISSING_ID, createdAt: '2000-01-01T00:00:00.000Z' };

        const updated = await repository.update(created.id, patch);

        expect(updated.id).toBe(created.id);
        expect(updated.createdAt).toBe(created.createdAt);
      });

      it('rejects invalid patches and keeps the previous state', async () => {
        const created = await repository.create(makeDraft());

        await expect(repository.update(created.id, { progress: 150 })).rejects.toBeInstanceOf(
          ProjectValidationError,
        );
        await expect(repository.get(created.id)).resolves.toEqual(created);
      });

      it('rejects unknown ids', async () => {
        await expect(repository.update(MISSING_ID, { progress: 10 })).rejects.toBeInstanceOf(
          ProjectNotFoundError,
        );
      });
    });

    describe('remove', () => {
      it('deletes the project', async () => {
        const created = await repository.create(makeDraft());
        await repository.remove(created.id);

        await expect(repository.get(created.id)).resolves.toBeNull();
      });

      it('rejects unknown ids', async () => {
        await expect(repository.remove(MISSING_ID)).rejects.toBeInstanceOf(ProjectNotFoundError);
      });
    });

    describe('replaceAll', () => {
      it('replaces the whole collection', async () => {
        const kept = await repository.create(makeDraft({ title: 'Mantido' }));
        await repository.create(makeDraft({ title: 'Descartado' }));

        await repository.replaceAll([kept]);

        await expect(repository.list()).resolves.toEqual([kept]);
      });

      it('is all-or-nothing when any project is invalid', async () => {
        const existing = await repository.create(makeDraft());
        const invalid = { ...existing, id: MISSING_ID, progress: -5 };

        await expect(repository.replaceAll([existing, invalid])).rejects.toBeInstanceOf(
          ProjectValidationError,
        );
        await expect(repository.list()).resolves.toEqual([existing]);
      });

      it('rejects duplicated ids', async () => {
        const existing = await repository.create(makeDraft());

        await expect(repository.replaceAll([existing, existing])).rejects.toBeInstanceOf(
          ProjectValidationError,
        );
      });
    });

    it('returns copies, never internal references', async () => {
      const created = await repository.create(makeDraft());
      created.title = 'Mutated outside';

      const [listed] = await repository.list();
      if (listed) listed.milestones.push({ ...makeMilestone() });

      const stored = await repository.get(created.id);
      expect(stored?.title).toBe('Aprender piano');
      expect(stored?.milestones).toEqual([]);
    });
  });
}

function makeMilestone() {
  return {
    id: '00000000-0000-4000-8000-000000000100',
    title: 'Marco',
    date: '2026-03-01' as ISODate,
    completed: false,
  };
}

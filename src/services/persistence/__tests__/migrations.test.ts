import { describe, expect, it, vi } from 'vitest';

import { PersistenceError, ProjectValidationError } from '../errors';
import { InMemoryRepository } from '../InMemoryRepository';
import { migrateSnapshot } from '../migrations';
import { createDependencies, makeDraft } from './helpers';

async function validSnapshot() {
  const repository = new InMemoryRepository([], createDependencies());
  const project = await repository.create(makeDraft());
  return { schemaVersion: 2, exportedAt: '2026-11-21T12:00:00.000Z', projects: [project] };
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
    expect(() => migrateSnapshot({ schemaVersion: 3, projects: [] })).toThrow(
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

  describe('v1 → v2: lifecycle backfill', () => {
    /** A project as version 1 stored it: no `lifecycle`. */
    function v1Project(status: string, extra: Record<string, unknown> = {}) {
      return {
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Projeto antigo',
        description: '',
        horizon: 'short',
        category: null,
        status,
        color: 'blue',
        startDate: '2026-02-02',
        endDate: '2026-04-30',
        progress: 60,
        milestones: [],
        sortOrder: 0,
        createdAt: '2026-01-05T10:00:00.000Z',
        updatedAt: '2026-05-04T15:30:00.000Z',
        ...extra,
      };
    }

    function migrateOne(status: string) {
      const snapshot = migrateSnapshot({
        schemaVersion: 1,
        exportedAt: '2026-11-21T12:00:00.000Z',
        projects: [v1Project(status)],
      });
      expect(snapshot.schemaVersion).toBe(2);
      const [project] = snapshot.projects;
      if (!project) throw new Error('project lost in migration');
      return project;
    }

    it('keeps every v1 field and leaves the history empty (no invented events)', () => {
      const project = migrateOne('in_progress');
      expect(project).toMatchObject({
        title: 'Projeto antigo',
        progress: 60,
        startDate: '2026-02-02',
        endDate: '2026-04-30',
      });
      expect(project.lifecycle.history).toEqual([]);
    });

    it('takes the planned start as the actual start for projects past "planned"', () => {
      expect(migrateOne('planned').lifecycle.startedAt).toBeNull();
      expect(migrateOne('in_progress').lifecycle.startedAt).toBe('2026-02-02');
      expect(migrateOne('completed').lifecycle.startedAt).toBe('2026-02-02');
    });

    it('dates completion and closing on the last change', () => {
      expect(migrateOne('completed').lifecycle).toMatchObject({
        completedAt: '2026-05-04',
        closedAt: null,
      });
      expect(migrateOne('cancelled').lifecycle).toMatchObject({
        completedAt: null,
        closedAt: '2026-05-04',
        closeReason: null,
      });
    });

    it('marks postponed projects as having no forecast', () => {
      expect(migrateOne('paused').lifecycle.postponement).toEqual({
        reason: '',
        expectedResumeAt: null,
        revisedFinish: null,
      });
      expect(migrateOne('in_progress').lifecycle.postponement).toBeNull();
    });
  });

  describe('migration chain', () => {
    it('applies migrations in order from the stored version', async () => {
      const snapshot = { ...(await validSnapshot()), schemaVersion: 1 };
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

      // The current schema only validates v2, so the final validation fails on purpose:
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

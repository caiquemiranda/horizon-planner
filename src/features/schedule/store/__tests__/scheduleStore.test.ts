import { describe, expect, it, vi } from 'vitest';

import { InMemoryScheduleRepository, PersistenceError } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { addDependency, createTask, updateTask } from '../../lib/commands';
import { computeSchedule } from '../../lib/engine';
import { createIndustrialSchedule } from '../../lib/fixtures';
import { getProjectSyncPatch } from '../../lib/portfolioSync';
import { createScheduleStore } from '../scheduleStore';

const NOW = new Date('2026-11-22T12:00:00Z');

function demo(projectId: string): ProjectSchedule {
  return createIndustrialSchedule({
    projectId,
    start: '2026-11-23' as ISODate,
    generateId: (key) => `${projectId}-${key}`,
    now: NOW,
  });
}

function ids() {
  let next = 0;
  return () => `new-${String(next++)}`;
}

/** Waits until pending promises (saves) have settled. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const sharedIds = ids();
const addTask = (name: string) => (schedule: ProjectSchedule) =>
  createTask(
    schedule,
    { name, parentId: null, start: '2026-11-23' as ISODate, duration: 1 },
    sharedIds,
  ).schedule;

describe('scheduleStore', () => {
  it('opens an unplanned project with an empty schedule', async () => {
    const store = createScheduleStore(new InMemoryScheduleRepository());
    await store.getState().open('project-1');

    expect(store.getState()).toMatchObject({ status: 'ready', projectId: 'project-1' });
    expect(store.getState().schedule?.tasks).toEqual([]);
    expect(store.getState().result?.range).toBeNull();
  });

  it('applies commands, recomputes and saves them', async () => {
    const repository = new InMemoryScheduleRepository([demo('project-1')]);
    const store = createScheduleStore(repository);
    await store.getState().open('project-1');

    const result = store
      .getState()
      .apply((schedule) => updateTask(schedule, 'project-1-A', { duration: 4 }));
    expect(result).toEqual({ ok: true });
    expect(store.getState().saveStatus).toBe('saving');
    // The successor B moved immediately, before the save completes.
    expect(store.getState().result?.tasks.get('project-1-B')?.start).toBeGreaterThan(
      computeSchedule(demo('project-1')).tasks.get('project-1-B')?.start ?? Infinity,
    );

    await settle();
    expect(store.getState().saveStatus).toBe('saved');
    const stored = await repository.get('project-1');
    expect(stored?.tasks.find((task) => task.id === 'project-1-A')?.duration).toBe(4);
    expect(store.getState().schedule?.revision).toBe(stored?.revision);
  });

  it('returns rule violations as messages and changes nothing', async () => {
    const store = createScheduleStore(new InMemoryScheduleRepository([demo('project-1')]));
    await store.getState().open('project-1');
    const before = store.getState().schedule;

    const result = store
      .getState()
      .apply(
        (schedule) =>
          addDependency(
            schedule,
            { predecessorId: 'project-1-M', successorId: 'project-1-A', type: 'FS', lag: 0 },
            ids(),
          ).schedule,
      );

    expect(result).toEqual({ ok: false, error: expect.stringContaining('circular') as string });
    expect(store.getState().schedule).toBe(before);
  });

  it('never shows the previous project after a quick switch', async () => {
    const repository = new InMemoryScheduleRepository([demo('project-1'), demo('project-2')]);
    let releaseFirst: () => void = () => undefined;
    const get = repository.get.bind(repository);
    vi.spyOn(repository, 'get').mockImplementation(async (projectId) => {
      if (projectId === 'project-1') {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return get(projectId);
    });
    const store = createScheduleStore(repository);

    const first = store.getState().open('project-1');
    expect(store.getState().schedule).toBeNull();
    await store.getState().open('project-2');
    releaseFirst();
    await first;

    expect(store.getState().projectId).toBe('project-2');
    expect(store.getState().schedule?.projectId).toBe('project-2');
    expect(
      [...(store.getState().result?.tasks.keys() ?? [])].every((id) => id.startsWith('project-2')),
    ).toBe(true);
  });

  it('keeps every edit when several are made during a save', async () => {
    const repository = new InMemoryScheduleRepository();
    const store = createScheduleStore(repository);
    await store.getState().open('project-1');

    store.getState().apply(addTask('Primeira'));
    store.getState().apply(addTask('Segunda'));
    store.getState().apply(addTask('Terceira'));
    await settle();
    await settle();

    expect(store.getState().saveStatus).toBe('saved');
    expect((await repository.get('project-1'))?.tasks.map((task) => task.name)).toEqual([
      'Primeira',
      'Segunda',
      'Terceira',
    ]);
  });

  it('reports a failed save, keeps the edit and retries', async () => {
    const repository = new InMemoryScheduleRepository();
    const save = repository.save.bind(repository);
    const spy = vi
      .spyOn(repository, 'save')
      .mockRejectedValueOnce(new PersistenceError('quota-exceeded', 'cheio'));
    const store = createScheduleStore(repository);
    await store.getState().open('project-1');

    store.getState().apply(addTask('Levantamento'));
    await settle();
    expect(store.getState()).toMatchObject({
      saveStatus: 'error',
      saveError: 'Não há espaço suficiente no armazenamento do navegador.',
    });
    expect(store.getState().schedule?.tasks).toHaveLength(1);

    spy.mockImplementation(save);
    await store.getState().retrySave();
    expect(store.getState().saveStatus).toBe('saved');
    expect((await repository.get('project-1'))?.tasks).toHaveLength(1);
  });

  it('detects an edit made in another tab and lets the user choose', async () => {
    const repository = new InMemoryScheduleRepository([demo('project-1')]);
    const store = createScheduleStore(repository);
    await store.getState().open('project-1');
    const stored = await repository.get('project-1');
    if (!stored) throw new Error('missing');

    // Another tab saves first (revision 1), while this tab has a pending edit.
    repository.changeExternally(
      { ...stored, revision: 5, tasks: stored.tasks.slice(0, 1), dependencies: [] },
      { notify: false },
    );
    store.getState().apply(addTask('Local'));
    await settle();
    expect(store.getState().saveStatus).toBe('conflict');
    expect(store.getState().saveError).toMatch(/outra aba/);

    await store.getState().overwrite();
    expect(store.getState().saveStatus).toBe('saved');
    expect((await repository.get('project-1'))?.tasks.some((task) => task.name === 'Local')).toBe(
      true,
    );
  });

  it('can drop local changes after a conflict', async () => {
    const repository = new InMemoryScheduleRepository([demo('project-1')]);
    const store = createScheduleStore(repository);
    await store.getState().open('project-1');
    repository.changeExternally(
      { ...demo('project-1'), revision: 9, tasks: [], dependencies: [] },
      { notify: false },
    );
    store.getState().apply(addTask('Local'));
    await settle();

    await store.getState().reload();
    expect(store.getState()).toMatchObject({ status: 'ready', saveStatus: 'saved' });
    expect(store.getState().schedule?.tasks).toEqual([]);
  });

  it('follows edits from another tab when nothing is pending', async () => {
    const repository = new InMemoryScheduleRepository([demo('project-1')]);
    const store = createScheduleStore(repository);
    await store.getState().open('project-1');

    repository.changeExternally({ ...demo('project-1'), revision: 3, tasks: [], dependencies: [] });
    await settle();
    expect(store.getState().schedule?.tasks).toEqual([]);
  });

  it('reports a load failure', async () => {
    const repository = new InMemoryScheduleRepository();
    vi.spyOn(repository, 'get').mockRejectedValue(new Error('boom'));
    const store = createScheduleStore(repository);
    await store.getState().open('project-1');
    expect(store.getState()).toMatchObject({
      status: 'error',
      loadError: 'Não foi possível carregar o cronograma deste projeto.',
    });
  });

  it('calls onSaved so the portfolio can follow the schedule', async () => {
    const onSaved = vi.fn();
    const store = createScheduleStore(new InMemoryScheduleRepository([demo('project-1')]), {
      onSaved,
    });
    await store.getState().open('project-1');
    store.getState().apply((schedule) => updateTask(schedule, 'project-1-A', { progress: 50 }));
    await settle();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('clears everything on close', async () => {
    const store = createScheduleStore(new InMemoryScheduleRepository([demo('project-1')]));
    await store.getState().open('project-1');
    store.getState().close();
    expect(store.getState()).toMatchObject({
      projectId: null,
      schedule: null,
      result: null,
      status: 'idle',
    });
  });
});

describe('getProjectSyncPatch', () => {
  const result = computeSchedule(demo('project-1'));

  it('spans the schedule and takes its weighted progress', () => {
    const project = makeProject({
      startDate: '2026-01-01' as ISODate,
      endDate: '2026-01-31' as ISODate,
      progress: 0,
    });
    expect(getProjectSyncPatch(project, result)).toEqual({
      startDate: '2026-11-23',
      endDate: '2026-12-23',
      progress: result.progress,
    });
  });

  it('widens the range to keep portfolio milestones valid', () => {
    const project = makeProject({
      startDate: '2026-11-01' as ISODate,
      endDate: '2027-02-01' as ISODate,
      milestones: [
        {
          id: '00000000-0000-4000-8000-0000000000aa',
          title: 'Kickoff',
          date: '2026-11-02' as ISODate,
          completed: true,
        },
      ],
    });
    expect(getProjectSyncPatch(project, result)).toMatchObject({
      startDate: '2026-11-02',
      endDate: '2026-12-23',
    });
  });

  it('returns null when nothing changes or the schedule is empty', () => {
    const project = makeProject({
      startDate: '2026-11-23' as ISODate,
      endDate: '2026-12-23' as ISODate,
      progress: result.progress,
    });
    expect(getProjectSyncPatch(project, result)).toBeNull();
    expect(getProjectSyncPatch(project, { tasks: new Map(), range: null, progress: 0 })).toBeNull();
  });
});

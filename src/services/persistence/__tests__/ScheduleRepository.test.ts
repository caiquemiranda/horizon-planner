import { describe, expect, it, vi } from 'vitest';

import { createEmptySchedule, createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import type { ISODate } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { PersistenceError, ProjectValidationError } from '../errors';
import {
  LocalStorageScheduleRepository,
  SCHEDULE_KEY_PREFIX,
} from '../LocalStorageScheduleRepository';
import {
  InMemoryScheduleRepository,
  ScheduleConflictError,
  type ScheduleRepository,
} from '../ScheduleRepository';
import { createClock, MemoryStorage } from './helpers';

const NOW = new Date('2026-11-22T12:00:00Z');

function demo(projectId = 'project-1'): ProjectSchedule {
  return createIndustrialSchedule({
    projectId,
    start: '2026-11-23' as ISODate,
    generateId: (key) => `${projectId}-${key}`,
    now: NOW,
  });
}

const implementations: [string, () => ScheduleRepository][] = [
  ['InMemoryScheduleRepository', () => new InMemoryScheduleRepository([], createClock())],
  [
    'LocalStorageScheduleRepository',
    () =>
      new LocalStorageScheduleRepository({
        storage: new MemoryStorage(),
        eventTarget: new EventTarget() as unknown as Window,
        now: createClock(),
      }),
  ],
];

describe.each(implementations)('%s contract', (_, create) => {
  it('returns null for a project that was never planned', async () => {
    await expect(create().get('project-1')).resolves.toBeNull();
  });

  it('saves with an increasing revision and reads it back', async () => {
    const repository = create();
    const first = await repository.save(demo(), 0);
    expect(first.revision).toBe(1);
    const second = await repository.save(
      { ...first, tasks: first.tasks.slice(0, 3), dependencies: [] },
      1,
    );
    expect(second.revision).toBe(2);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    await expect(repository.get('project-1')).resolves.toEqual(second);
  });

  it('rejects a save based on an old revision (conflict) and keeps the stored data', async () => {
    const repository = create();
    const saved = await repository.save(demo(), 0);
    await repository.save(saved, 1);

    const stale = repository.save({ ...saved, tasks: [] }, 1);
    await expect(stale).rejects.toBeInstanceOf(ScheduleConflictError);
    await expect(stale).rejects.toMatchObject({ storedRevision: 2 });
    expect((await repository.get('project-1'))?.tasks).toHaveLength(saved.tasks.length);
  });

  it('validates before writing', async () => {
    const repository = create();
    const invalid = {
      ...demo(),
      dependencies: [{ ...demo().dependencies[0], successorId: 'ghost' }],
    };
    await expect(repository.save(invalid as ProjectSchedule, 0)).rejects.toBeInstanceOf(
      ProjectValidationError,
    );
    await expect(repository.get('project-1')).resolves.toBeNull();
  });

  it('keeps projects isolated, removes and replaces schedules', async () => {
    const repository = create();
    await repository.save(demo('project-1'), 0);
    await repository.save(createEmptySchedule('project-2', NOW), 0);
    expect((await repository.get('project-2'))?.tasks).toEqual([]);

    await repository.remove('project-1');
    await expect(repository.get('project-1')).resolves.toBeNull();

    await repository.replaceAll([demo('project-3')]);
    const all = await repository.listAll();
    expect(all.map((schedule) => schedule.projectId)).toEqual(['project-3']);
  });

  it('refuses to replace everything with invalid data', async () => {
    const repository = create();
    await repository.save(demo('project-1'), 0);
    await expect(
      repository.replaceAll([
        { ...demo('project-2'), calendar: { workingWeekdays: [], holidays: [] } },
      ]),
    ).rejects.toBeInstanceOf(ProjectValidationError);
    expect(await repository.listAll()).toHaveLength(1);
  });
});

describe('LocalStorageScheduleRepository', () => {
  it('stores one versioned key per project', async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageScheduleRepository({ storage, now: createClock() });
    await repository.save(demo(), 0);
    const raw = JSON.parse(storage.getItem(`${SCHEDULE_KEY_PREFIX}project-1`) ?? '{}') as {
      schemaVersion: number;
    };
    expect(raw.schemaVersion).toBe(1);
    expect(storage.keys()).toEqual([`${SCHEDULE_KEY_PREFIX}project-1`]);
  });

  it('sees revisions written by another tab before saving', async () => {
    const storage = new MemoryStorage();
    const tabA = new LocalStorageScheduleRepository({ storage, now: createClock() });
    const tabB = new LocalStorageScheduleRepository({ storage, now: createClock() });
    const saved = await tabA.save(demo(), 0);
    await tabB.save(saved, 1);
    await expect(tabA.save(saved, 1)).rejects.toBeInstanceOf(ScheduleConflictError);
  });

  it('keeps a copy of unreadable data and starts the plan from scratch', async () => {
    const storage = new MemoryStorage();
    storage.setItem(`${SCHEDULE_KEY_PREFIX}project-1`, '{ broken');
    const onRecover = vi.fn();
    const repository = new LocalStorageScheduleRepository({
      storage,
      now: createClock(),
      onRecover,
    });

    await expect(repository.get('project-1')).resolves.toBeNull();
    expect(onRecover).toHaveBeenCalledWith(
      expect.any(PersistenceError),
      expect.stringContaining(':backup:'),
    );
    const backup = storage.keys().find((key) => key.includes(':backup:')) ?? '';
    expect(storage.getItem(backup)).toBe('{ broken');
    await expect(repository.listAll()).resolves.toEqual([]);
  });

  it('refuses data written by a newer version instead of discarding it', async () => {
    const storage = new MemoryStorage();
    storage.setItem(`${SCHEDULE_KEY_PREFIX}project-1`, JSON.stringify({ schemaVersion: 99 }));
    const repository = new LocalStorageScheduleRepository({ storage });
    await expect(repository.get('project-1')).rejects.toMatchObject({
      reason: 'unsupported-version',
    });
    expect(storage.getItem(`${SCHEDULE_KEY_PREFIX}project-1`)).not.toBeNull();
  });

  it('reports a full storage and restores everything when replacing fails', async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageScheduleRepository({ storage, now: createClock() });
    await repository.save(demo('project-1'), 0);

    storage.failOnSet = new DOMException('full', 'QuotaExceededError');
    await expect(repository.save(demo('project-2'), 0)).rejects.toMatchObject({
      reason: 'quota-exceeded',
    });
    storage.failOnSet = null;

    // Only the new data set does not fit: the previous one must come back.
    const setItem = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key.endsWith('project-3')) throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    });
    await expect(repository.replaceAll([demo('project-3')])).rejects.toBeInstanceOf(
      PersistenceError,
    );

    expect((await repository.listAll()).map((schedule) => schedule.projectId)).toEqual([
      'project-1',
    ]);
  });

  it('notifies changes made by other tabs', () => {
    const target = new EventTarget();
    const repository = new LocalStorageScheduleRepository({
      storage: new MemoryStorage(),
      eventTarget: target as unknown as Window,
    });
    const listener = vi.fn();
    const unsubscribe = repository.subscribe(listener);

    const event = (key: string) => Object.assign(new Event('storage'), { key });
    target.dispatchEvent(event(`${SCHEDULE_KEY_PREFIX}project-1`));
    target.dispatchEvent(event('horizon-planner:data'));
    target.dispatchEvent(event(`${SCHEDULE_KEY_PREFIX}project-1:backup:x`));
    unsubscribe();
    target.dispatchEvent(event(`${SCHEDULE_KEY_PREFIX}project-2`));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('project-1');
  });
});

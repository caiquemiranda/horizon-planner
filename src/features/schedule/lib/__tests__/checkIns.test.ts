import { describe, expect, it } from 'vitest';

import { buildOutline, taskId } from '@/test/schedule';
import type { ISODate } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { projectScheduleSchema } from '../../schemas';
import { createWorkCalendar, DEFAULT_CALENDAR } from '../calendar';
import {
  completeTaskOn,
  formatDays,
  getDailyAgenda,
  progressFromWork,
  recordCheckIn,
  removeCheckIn,
  workFromProgress,
} from '../checkIns';
import { deleteTask, updateTask } from '../commands';
import { computeSchedule } from '../engine';
import { createEmptySchedule } from '../fixtures';

const MON = '2026-11-23' as ISODate;
const TUE = '2026-11-24' as ISODate;
const WED = '2026-11-25' as ISODate;
const FRI = '2026-11-27' as ISODate;
const SAT = '2026-11-28' as ISODate;

let counter = 0;
const context = (today: ISODate = FRI) => ({
  today,
  now: '2026-11-27T18:00:00.000Z',
  generateId: () => `ci-${String((counter += 1))}`,
});

function schedule(): ProjectSchedule {
  return {
    ...createEmptySchedule('p'),
    tasks: buildOutline([
      {
        key: 'Phase',
        children: [
          { key: 'Five', task: { start: MON, duration: 5 } },
          { key: 'Three', task: { start: MON, duration: 3 } },
        ],
      },
      { key: 'Gate', task: { start: FRI, duration: 0 } },
    ]),
  };
}

const task = (s: ProjectSchedule, key: string) => {
  const found = s.tasks.find((item) => item.id === taskId(key));
  if (!found) throw new Error(key);
  return found;
};

const done = (key: string, workDate: ISODate, units?: number) => ({
  taskId: taskId(key),
  workDate,
  state: 'done' as const,
  ...(units === undefined ? {} : { units }),
});

describe('work and percentage', () => {
  it('converts both ways and reaches 100% only with all the work', () => {
    expect(workFromProgress(40, 5)).toBe(2);
    expect(progressFromWork(2, 5)).toBe(40);
    expect(progressFromWork(4.9, 5)).toBe(98);
    expect(progressFromWork(4.99, 5)).toBe(99);
    expect(progressFromWork(5, 5)).toBe(100);
    expect(progressFromWork(0.01, 5)).toBe(1);
    expect(progressFromWork(0, 0)).toBe(0);
    expect(progressFromWork(0, 0, true)).toBe(100);
  });
});

describe('recordCheckIn', () => {
  it('does not close a 5-day task with one day of work (scenario 11)', () => {
    const next = recordCheckIn(schedule(), done('Five', MON), context());
    expect(task(next, 'Five')).toMatchObject({
      completedWork: 1,
      progress: 20,
      actualStart: MON,
      actualFinish: null,
    });
    expect(next.checkIns).toEqual([
      expect.objectContaining({ taskId: taskId('Five'), workDate: MON, state: 'done', units: 1 }),
    ]);
  });

  it('reaches exactly 100% after three one-day check-ins on a 3-day task', () => {
    let next = schedule();
    for (const date of [MON, TUE, WED]) next = recordCheckIn(next, done('Three', date), context());
    expect(task(next, 'Three')).toMatchObject({
      completedWork: 3,
      progress: 100,
      actualStart: MON,
      actualFinish: WED,
    });
  });

  it('never counts the same day twice: repeating replaces (scenario 8)', () => {
    let next = recordCheckIn(schedule(), done('Five', MON), context());
    next = recordCheckIn(next, done('Five', MON), context());
    expect(next.checkIns).toHaveLength(1);
    expect(task(next, 'Five').completedWork).toBe(1);

    // Correcting the amount of that day replaces it too.
    next = recordCheckIn(next, done('Five', MON, 2), context());
    expect(next.checkIns).toHaveLength(1);
    expect(task(next, 'Five').completedWork).toBe(2);
  });

  it('accepts a confirmation for an earlier day, keeping the history (scenario 9)', () => {
    let next = recordCheckIn(schedule(), done('Five', WED), context());
    next = recordCheckIn(next, done('Five', MON), context());
    expect(task(next, 'Five')).toMatchObject({ completedWork: 2, actualStart: MON });
    expect(next.checkIns.map((checkIn) => checkIn.workDate)).toEqual([WED, MON]);
  });

  it('records "not done" as a fact that adds no work', () => {
    const next = recordCheckIn(
      schedule(),
      { taskId: taskId('Five'), workDate: MON, state: 'not_done' },
      context(),
    );
    expect(next.checkIns[0]).toMatchObject({ state: 'not_done', units: 0 });
    expect(task(next, 'Five')).toMatchObject({ completedWork: 0, progress: 0, actualStart: null });
  });

  it('turns a "done" day into "not done", taking its work back', () => {
    let next = recordCheckIn(schedule(), done('Five', MON), context());
    next = recordCheckIn(
      next,
      { taskId: taskId('Five'), workDate: MON, state: 'not_done' },
      context(),
    );
    expect(task(next, 'Five')).toMatchObject({ completedWork: 0, progress: 0 });
  });

  it('accepts half days and refuses more work than remains', () => {
    const half = recordCheckIn(schedule(), done('Three', MON, 0.5), context());
    expect(task(half, 'Three').completedWork).toBe(0.5);
    expect(() => recordCheckIn(schedule(), done('Three', MON, 0.3), context())).toThrow(
      /meio em meio dia/,
    );
    expect(() => recordCheckIn(schedule(), done('Three', MON, 4), context())).toThrow(
      /Restam 3 dias/,
    );
  });

  it('finishes work left over from a typed percentage, in any amount', () => {
    // 60% of 3 days = 1,8 days done: 1,2 days remain, not a multiple of half a day.
    const typed = updateTask(schedule(), taskId('Three'), { progress: 60 });
    const finished = completeTaskOn(typed, taskId('Three'), MON, context());
    expect(task(finished, 'Three')).toMatchObject({ completedWork: 3, progress: 100 });
    expect(finished.checkIns[0]?.units).toBe(1.2);

    const nearlyDone = updateTask(schedule(), taskId('Three'), { progress: 90 });
    const lastBit = recordCheckIn(nearlyDone, done('Three', MON), context());
    expect(task(lastBit, 'Three')).toMatchObject({ completedWork: 3, progress: 100 });
  });

  it('formats amounts of work with at most one decimal', () => {
    expect(formatDays(1)).toBe('1 dia');
    expect(formatDays(2.5)).toBe('2,5 dias');
    expect(formatDays(1.333)).toBe('1,3 dias');
  });

  it('refuses future dates and summary tasks', () => {
    expect(() => recordCheckIn(schedule(), done('Five', SAT), context(FRI))).toThrow(
      /hoje ou de dias anteriores/,
    );
    expect(() => recordCheckIn(schedule(), done('Phase', MON), context())).toThrow(
      /Tarefas resumo/,
    );
  });

  it('completes a milestone with a single confirmation', () => {
    const next = recordCheckIn(schedule(), done('Gate', FRI), context());
    expect(task(next, 'Gate')).toMatchObject({ progress: 100, actualFinish: FRI });
  });
});

describe('completeTaskOn and removeCheckIn', () => {
  it('confirms all the remaining work, and undoing reopens the task (scenario 13)', () => {
    let next = recordCheckIn(schedule(), done('Five', MON), context());
    next = completeTaskOn(next, taskId('Five'), TUE, context());
    expect(task(next, 'Five')).toMatchObject({
      completedWork: 5,
      progress: 100,
      actualFinish: TUE,
    });
    expect(next.checkIns.find((checkIn) => checkIn.workDate === TUE)?.units).toBe(4);

    next = removeCheckIn(next, taskId('Five'), TUE);
    expect(task(next, 'Five')).toMatchObject({
      completedWork: 1,
      progress: 20,
      actualFinish: null,
    });
    expect(() =>
      completeTaskOn(
        completeTaskOn(next, taskId('Five'), WED, context()),
        taskId('Five'),
        FRI,
        context(),
      ),
    ).toThrow(/já está concluída/);
  });

  it('brings the project to 100% when the last task is completed (scenario 12)', () => {
    let next = schedule();
    next = completeTaskOn(next, taskId('Five'), WED, context());
    next = completeTaskOn(next, taskId('Three'), WED, context());
    expect(computeSchedule(next).progress).toBe(100);
  });

  it('ignores undoing a day that has no confirmation', () => {
    const base = schedule();
    expect(removeCheckIn(base, taskId('Five'), MON)).toBe(base);
  });
});

describe('consistency with the other commands', () => {
  it('keeps the work behind an edited percentage or duration', () => {
    let next = updateTask(schedule(), taskId('Five'), { progress: 40 });
    expect(task(next, 'Five').completedWork).toBe(2);
    next = updateTask(next, taskId('Five'), { duration: 10 });
    expect(task(next, 'Five')).toMatchObject({ progress: 40, completedWork: 4 });
  });

  it('drops the confirmations of a deleted task', () => {
    let next = recordCheckIn(schedule(), done('Five', MON), context());
    next = deleteTask(next, taskId('Phase')).schedule;
    expect(next.checkIns).toEqual([]);
  });

  it('is refused by validation when a task has two confirmations on one day', () => {
    const next = recordCheckIn(schedule(), done('Five', MON), context());
    const [first] = next.checkIns;
    if (!first) throw new Error('missing');
    const broken = { ...next, checkIns: [first, { ...first, id: 'other' }] };
    expect(projectScheduleSchema.safeParse(broken).success).toBe(false);
    expect(projectScheduleSchema.safeParse(next).success).toBe(true);
  });
});

describe('getDailyAgenda', () => {
  const calendar = createWorkCalendar(DEFAULT_CALENDAR);
  const agenda = (s: ProjectSchedule, date: ISODate) =>
    getDailyAgenda(s, computeSchedule(s), calendar, date);

  it('lists the leaf tasks planned for the day, pending until confirmed', () => {
    const today = agenda(schedule(), TUE);
    expect(today.isWorkingDay).toBe(true);
    expect(today.planned.map((item) => item.task.name)).toEqual(['Five', 'Three']);
    expect(today.planned.every((item) => item.state === 'pending')).toBe(true);
    expect(today.overdue).toEqual([]);

    const confirmed = agenda(recordCheckIn(schedule(), done('Five', TUE), context()), TUE);
    expect(confirmed.planned[0]).toMatchObject({ state: 'done' });
  });

  it('shows unfinished tasks whose planned end has passed as overdue', () => {
    const friday = agenda(schedule(), FRI);
    // "Three" ended on Wednesday and is not done; "Five" is planned through Friday.
    expect(friday.overdue.map((item) => item.task.name)).toEqual(['Three']);
    expect(friday.planned.map((item) => item.task.name)).toEqual(['Five', 'Gate']);
  });

  it('asks nothing on a day off, so there is nothing to miss (scenario 3)', () => {
    const saturday = agenda(schedule(), SAT);
    expect(saturday.isWorkingDay).toBe(false);
    expect(saturday.planned).toEqual([]);
  });
});

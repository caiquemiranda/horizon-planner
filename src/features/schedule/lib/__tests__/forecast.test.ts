import { describe, expect, it } from 'vitest';

import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { makeLink, makeTask, taskId } from '@/test/schedule';
import type { ISODate } from '@/types/project';
import type { ProjectSchedule, ScheduleTask, TaskDependency } from '@/types/schedule';

import { recordCheckIn } from '../checkIns';
import { updateTask } from '../commands';
import { computeSchedule } from '../engine';
import { createEmptySchedule } from '../fixtures';
import { clearBaseline, computeForecast, saveBaseline, workingDayVariance } from '../forecast';

// Week of 23 Nov 2026: Monday 23 … Friday 27; Monday 30 is the next week.
const MON = '2026-11-23' as ISODate;
const TUE = '2026-11-24' as ISODate;
const WED = '2026-11-25' as ISODate;
const THU = '2026-11-26' as ISODate;
const FRI = '2026-11-27' as ISODate;
const NEXT_MON = '2026-11-30' as ISODate;

const day = (date: ISODate) => isoDateToDay(date);
const iso = (value: number | null) => (value === null ? null : dayToIsoDate(value));

let counter = 0;
const ctx = (today: ISODate) => ({
  today,
  now: `${today}T18:00:00.000Z`,
  generateId: () => `c-${String((counter += 1))}`,
});

function build(
  tasks: ScheduleTask[],
  links: TaskDependency[] = [],
  holidays: { date: ISODate; name: string }[] = [],
): ProjectSchedule {
  const base = createEmptySchedule('p');
  return {
    ...base,
    calendar: { ...base.calendar, holidays },
    tasks: tasks.map((task, order) => ({ ...task, order })),
    dependencies: links,
  };
}

const one = (key: string, start: ISODate, duration = 1) =>
  makeTask({ id: taskId(key), name: key, start, duration });

/** A → B → C, one working day each, Monday to Wednesday. */
const chain = () =>
  build([one('A', MON), one('B', MON), one('C', MON)], [makeLink('A', 'B'), makeLink('B', 'C')]);

function forecast(schedule: ProjectSchedule, today: ISODate) {
  const result = computeForecast(schedule, computeSchedule(schedule), today);
  return { ...result, planned: iso(result.plannedFinish), finish: iso(result.forecastFinish) };
}

const done = (schedule: ProjectSchedule, key: string, date: ISODate, today: ISODate) =>
  recordCheckIn(schedule, { taskId: taskId(key), workDate: date, state: 'done' }, ctx(today));

describe('computeForecast', () => {
  it('equals the plan when everything is on time', () => {
    const result = forecast(chain(), MON);
    expect(result).toMatchObject({ planned: WED, finish: WED, variance: 0, causes: [] });
  });

  it('scenario 1: work not confirmed on Monday on a critical chain moves the finish one working day', () => {
    const result = forecast(chain(), TUE);
    expect(result).toMatchObject({ planned: WED, finish: THU, variance: 1 });
    expect(result.causes).toEqual([{ taskId: taskId('A'), deviation: 'late' }]);
  });

  it('scenario 2: work missed on Friday moves the finish to the next working day, not Saturday', () => {
    const schedule = build([one('A', FRI), one('B', FRI)], [makeLink('A', 'B')]);
    const result = forecast(schedule, NEXT_MON);
    expect(result.planned).toBe(NEXT_MON);
    expect(result.finish).toBe('2026-12-01');
    expect(result.variance).toBe(1);
  });

  it('scenario 3: a holiday asks for no work, so it brings no delay', () => {
    // Monday is a holiday: A is planned on Tuesday; on Tuesday nothing is late.
    const schedule = build(
      [one('A', MON), one('B', MON)],
      [makeLink('A', 'B')],
      [{ date: MON, name: 'Feriado' }],
    );
    const result = forecast(schedule, TUE);
    expect(result).toMatchObject({ planned: WED, finish: WED, variance: 0 });
  });

  it('scenario 4: two parallel late tasks on the same day add one day, not two', () => {
    const schedule = build(
      [one('A', MON), one('B', MON), one('C', MON)],
      [makeLink('A', 'C'), makeLink('B', 'C')],
    );
    const result = forecast(schedule, TUE);
    expect(result).toMatchObject({ planned: TUE, finish: WED, variance: 1 });
  });

  it('scenario 5: a late task with slack leaves the finish where it was', () => {
    // A (1 day) runs beside B (5 days); C needs both. A late by one day still fits.
    const schedule = build(
      [one('A', MON), one('B', MON, 5), one('C', MON)],
      [makeLink('A', 'C'), makeLink('B', 'C')],
    );
    const result = forecast(done(schedule, 'B', MON, TUE), TUE);
    expect(result).toMatchObject({ planned: NEXT_MON, finish: NEXT_MON, variance: 0 });
    expect(iso(result.tasks.get(taskId('A'))?.start ?? null)).toBe(TUE);
  });

  it('scenario 6: A and B done on Monday bring C to Tuesday (one day earlier, not two)', () => {
    let schedule = done(chain(), 'A', MON, MON);
    schedule = done(schedule, 'B', MON, MON);
    const result = forecast(schedule, MON);
    expect(result).toMatchObject({ planned: WED, finish: TUE, variance: -1 });
    expect(result.causes.map((cause) => cause.deviation)).toContain('early');

    const all = done(schedule, 'C', MON, MON);
    expect(forecast(all, MON)).toMatchObject({ finish: MON, variance: -2 });
  });

  it('scenario 7: three tasks planned and done on the same day give no artificial gain', () => {
    let schedule = build([one('A', MON), one('B', MON), one('C', MON)]);
    for (const key of ['A', 'B', 'C']) schedule = done(schedule, key, MON, MON);
    expect(forecast(schedule, MON)).toMatchObject({ planned: MON, finish: MON, variance: 0 });
  });

  it('scenario 8: computing again, or repeating a confirmation, changes nothing', () => {
    const late = chain();
    expect(forecast(late, WED)).toEqual(forecast(late, WED));
    const once = done(late, 'A', TUE, WED);
    const twice = done(once, 'A', TUE, WED);
    expect(forecast(twice, WED)).toEqual(forecast(once, WED));
  });

  it('scenario 9: confirming an earlier day later corrects the forecast', () => {
    expect(forecast(chain(), WED)).toMatchObject({ finish: FRI, variance: 2 });
    const corrected = done(chain(), 'A', MON, WED);
    // A was done on Monday after all: only B (Tuesday) is still unconfirmed.
    expect(forecast(corrected, WED)).toMatchObject({ finish: THU, variance: 1 });
  });

  it('scenario 11: one confirmed day of a 5-day task leaves 4 days of remaining work', () => {
    const schedule = build([one('Long', MON, 5)]);
    const result = forecast(done(schedule, 'Long', MON, TUE), TUE);
    expect(result.tasks.get(taskId('Long'))).toMatchObject({ state: 'in_progress', remaining: 4 });
    expect(result).toMatchObject({ planned: FRI, finish: FRI, variance: 0 });
  });

  it('counts today as available until its work is confirmed', () => {
    const schedule = build([one('Long', MON, 2)]);
    // Monday's day confirmed on Monday: the last day is Tuesday, as planned.
    expect(forecast(done(schedule, 'Long', MON, MON), MON)).toMatchObject({
      finish: TUE,
      variance: 0,
    });
  });

  it('scenario 14: never changes the plan', () => {
    const schedule = chain();
    const plan = computeSchedule(schedule);
    const before = structuredClone([...plan.tasks.values()]);
    computeForecast(schedule, plan, FRI);
    expect([...plan.tasks.values()]).toEqual(before);
  });

  it('keeps a typed 100% without dates where the plan put it', () => {
    const schedule = build([
      makeTask({ id: taskId('A'), start: MON, duration: 1, progress: 100, completedWork: 1 }),
    ]);
    expect(forecast(schedule, FRI)).toMatchObject({ finish: MON, variance: 0 });
  });

  it('gives no finish for an empty schedule', () => {
    expect(forecast(build([]), MON)).toMatchObject({ planned: null, finish: null, variance: 0 });
  });

  it('places a late milestone on the data date', () => {
    const schedule = build([one('A', MON), one('Gate', MON, 0)], [makeLink('A', 'Gate')]);
    const result = forecast(schedule, WED);
    expect(iso(result.tasks.get(taskId('Gate'))?.start ?? null)).toBe(THU);
    expect(day(THU)).toBeGreaterThan(day(TUE));
  });
});

describe('baseline', () => {
  it('saves the plan dates and keeps them when the plan changes later', () => {
    const schedule = chain();
    const saved = saveBaseline(schedule, computeSchedule(schedule), '2026-11-23T09:00:00.000Z');
    expect(saved.baseline).toEqual({
      savedAt: '2026-11-23T09:00:00.000Z',
      finish: WED,
      tasks: {
        [taskId('A')]: { start: MON, finish: MON },
        [taskId('B')]: { start: TUE, finish: TUE },
        [taskId('C')]: { start: WED, finish: WED },
      },
    });

    const longer = updateTask(saved, taskId('C'), { duration: 3 });
    expect(longer.baseline).toEqual(saved.baseline);
    expect(iso(computeForecast(longer, computeSchedule(longer), MON).plannedFinish)).toBe(FRI);
    expect(clearBaseline(longer).baseline).toBeNull();
  });

  it('refuses an empty schedule', () => {
    const empty = build([]);
    expect(() => saveBaseline(empty, computeSchedule(empty), 'x')).toThrow(/Crie tarefas/);
  });

  it('measures variances in working days, across weekends', () => {
    const schedule = build([]);
    expect(workingDayVariance(schedule, day(FRI), day(NEXT_MON))).toBe(1);
    expect(workingDayVariance(schedule, day(NEXT_MON), day(FRI))).toBe(-1);
    expect(workingDayVariance(schedule, day(WED), day(WED))).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { dayToIsoDate } from '@/features/timeline/lib/time';
import { buildOutline, makeLink, makeTask, taskId } from '@/test/schedule';
import type { ISODate } from '@/types/project';
import type {
  ProjectCalendar,
  ScheduleResult,
  ScheduleTask,
  TaskDependency,
} from '@/types/schedule';

import { DEFAULT_CALENDAR } from '../calendar';
import { computeSchedule, getDisplayFinish } from '../engine';

const MONDAY = '2026-11-23' as ISODate;

function run(
  tasks: ScheduleTask[],
  dependencies: TaskDependency[] = [],
  calendar: ProjectCalendar = DEFAULT_CALENDAR,
) {
  return computeSchedule({ tasks, dependencies, calendar });
}

/** `[first working day, last working day]` of a task, as ISO dates. */
function datesOf(result: ScheduleResult, key: string): [string, string] {
  const task = result.tasks.get(taskId(key));
  if (!task) throw new Error(`Task ${key} was not scheduled`);
  return [dayToIsoDate(task.start), dayToIsoDate(getDisplayFinish(task))];
}

const leaf = (key: string, duration: number, extra: Partial<ScheduleTask> = {}) =>
  makeTask({ id: taskId(key), name: key, start: MONDAY, duration, ...extra });

describe('computeSchedule', () => {
  it('spec 13.1: A (2d) → B (3d) → C (1d) across a weekend', () => {
    const result = run(
      [leaf('A', 2), leaf('B', 3, { order: 1 }), leaf('C', 1, { order: 2 })],
      [makeLink('A', 'B'), makeLink('B', 'C')],
    );

    expect(datesOf(result, 'A')).toEqual(['2026-11-23', '2026-11-24']);
    expect(datesOf(result, 'B')).toEqual(['2026-11-25', '2026-11-27']);
    expect(datesOf(result, 'C')).toEqual(['2026-11-30', '2026-11-30']);
    // Internal representation: half-open range, finish is the day after the last one.
    expect(dayToIsoDate(result.tasks.get(taskId('B'))?.finish ?? 0)).toBe('2026-11-28');
    expect(result.tasks.get(taskId('B'))?.drivingDependencyId).toBe(makeLink('A', 'B').id);
  });

  it('leaves unlinked tasks at their requested start, in parallel', () => {
    const result = run([leaf('A', 2), leaf('B', 3, { order: 1 })]);
    expect(datesOf(result, 'A')[0]).toBe('2026-11-23');
    expect(datesOf(result, 'B')[0]).toBe('2026-11-23');
  });

  it('never moves an auto task before its requested start', () => {
    const result = run(
      [leaf('A', 1), leaf('B', 1, { order: 1, start: '2026-12-07' as ISODate })],
      [makeLink('A', 'B')],
    );
    expect(datesOf(result, 'B')[0]).toBe('2026-12-07');
    expect(result.tasks.get(taskId('B'))?.drivingDependencyId).toBeNull();
  });

  it('snaps a weekend start to the next working day', () => {
    const result = run([leaf('A', 1, { start: '2026-11-28' as ISODate })]);
    expect(datesOf(result, 'A')).toEqual(['2026-11-30', '2026-11-30']);
  });

  describe('link types and lags', () => {
    // A: Mon 23 – Wed 25/11 (3 days). B: 2 days.
    const tasks = () => [leaf('A', 3), leaf('B', 2, { order: 1 })];

    it.each([
      ['FS', 0, ['2026-11-26', '2026-11-27']],
      ['FS', 2, ['2026-11-30', '2026-12-01']],
      ['FS', -1, ['2026-11-25', '2026-11-26']],
      ['SS', 0, ['2026-11-23', '2026-11-24']],
      ['SS', 1, ['2026-11-24', '2026-11-25']],
      ['FF', 0, ['2026-11-24', '2026-11-25']],
      ['FF', 3, ['2026-11-27', '2026-11-30']],
      ['SF', 0, ['2026-11-23', '2026-11-24']],
      ['SF', 4, ['2026-11-25', '2026-11-26']],
    ] as const)('%s with lag %i places B on %j', (type, lag, expected) => {
      const result = run(tasks(), [makeLink('A', 'B', type, lag)]);
      expect(datesOf(result, 'B')).toEqual(expected);
    });
  });

  it('uses the most restrictive of several predecessors', () => {
    const result = run(
      [leaf('A', 1), leaf('B', 4, { order: 1 }), leaf('C', 1, { order: 2 })],
      [makeLink('A', 'C'), makeLink('B', 'C')],
    );
    expect(datesOf(result, 'C')[0]).toBe('2026-11-27');
    expect(result.tasks.get(taskId('C'))?.drivingDependencyId).toBe(makeLink('B', 'C').id);
  });

  it('pushes every successor of a predecessor', () => {
    const result = run(
      [leaf('A', 2), leaf('B', 1, { order: 1 }), leaf('C', 1, { order: 2 })],
      [makeLink('A', 'B'), makeLink('A', 'C')],
    );
    expect(datesOf(result, 'B')[0]).toBe('2026-11-25');
    expect(datesOf(result, 'C')[0]).toBe('2026-11-25');
  });

  it('propagates through a chain in topological order, whatever the storage order', () => {
    const tasks = [leaf('C', 1, { order: 2 }), leaf('A', 1), leaf('B', 1, { order: 1 })];
    const links = [makeLink('B', 'C'), makeLink('A', 'B')];
    const result = run(tasks, links);
    expect(datesOf(result, 'C')[0]).toBe('2026-11-25');
    expect(run([...tasks].reverse(), [...links].reverse()).tasks).toEqual(result.tasks);
  });

  it('keeps manual tasks in place and reports the violated link', () => {
    const result = run(
      [leaf('A', 3), leaf('B', 1, { order: 1, mode: 'manual' })],
      [makeLink('A', 'B')],
    );
    const b = result.tasks.get(taskId('B'));
    expect(datesOf(result, 'B')[0]).toBe('2026-11-23');
    expect(b?.issues).toEqual([
      expect.objectContaining({ code: 'dependency-violated', dependencyId: makeLink('A', 'B').id }),
    ]);
  });

  it('schedules milestones as zero-duration tasks that can be linked', () => {
    const result = run(
      [leaf('A', 2), leaf('M', 0, { order: 1 }), leaf('B', 1, { order: 2 })],
      [makeLink('A', 'M'), makeLink('M', 'B')],
    );
    const milestone = result.tasks.get(taskId('M'));
    expect(milestone?.kind).toBe('milestone');
    expect(milestone?.start).toBe(milestone?.finish);
    expect(datesOf(result, 'M')).toEqual(['2026-11-25', '2026-11-25']);
    expect(datesOf(result, 'B')[0]).toBe('2026-11-25');
  });

  it('respects configured holidays', () => {
    const result = run([leaf('A', 2), leaf('B', 1, { order: 1 })], [makeLink('A', 'B')], {
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [{ date: '2026-11-25' as ISODate, name: 'Feriado' }],
    });
    expect(datesOf(result, 'B')[0]).toBe('2026-11-26');
  });

  describe('summary roll-up', () => {
    const outline = () =>
      buildOutline([
        {
          key: 'Phase',
          children: [
            { key: 'A', task: { start: MONDAY, duration: 2, progress: 100 } },
            { key: 'B', task: { start: MONDAY, duration: 4, progress: 50 } },
            {
              key: 'Sub',
              children: [
                {
                  key: 'C',
                  task: { start: '2026-11-30' as ISODate, duration: 5, progress: 0 },
                },
              ],
            },
          ],
        },
      ]);

    it('spans min start to max finish of descendants, at any depth', () => {
      const result = run(outline());
      expect(datesOf(result, 'Phase')).toEqual(['2026-11-23', '2026-12-04']);
      expect(datesOf(result, 'Sub')).toEqual(['2026-11-30', '2026-12-04']);
      expect(result.tasks.get(taskId('Phase'))?.kind).toBe('summary');
    });

    it('does not add up the durations of parallel children', () => {
      const result = run(outline());
      // A (2d) and B (4d) run in parallel: the phase lasts 10 working days, not 11.
      expect(result.tasks.get(taskId('Phase'))?.duration).toBe(10);
    });

    it('weights progress by working-day duration', () => {
      const result = run(outline());
      // (2·100 + 4·50 + 5·0) / 11 = 36.4
      expect(result.tasks.get(taskId('Phase'))?.progress).toBe(36);
      expect(result.progress).toBe(36);
    });

    it('updates transitively when a grandchild moves', () => {
      const tasks = outline().map((task) =>
        task.id === taskId('C') ? { ...task, start: '2026-12-07' as ISODate } : task,
      );
      expect(datesOf(run(tasks), 'Phase')[1]).toBe('2026-12-11');
    });

    it('ignores links that touch a summary task and reports them', () => {
      const tasks = [...outline(), leaf('X', 1, { order: 1 })];
      const result = run(tasks, [makeLink('Phase', 'X')]);
      expect(datesOf(result, 'X')[0]).toBe('2026-11-23');
      expect(result.tasks.get(taskId('X'))?.issues[0]?.code).toBe('summary-link');
    });
  });

  it('survives corrupted cyclic links without looping', () => {
    const result = run(
      [leaf('A', 1), leaf('B', 1, { order: 1 })],
      [makeLink('A', 'B'), makeLink('B', 'A')],
    );
    expect(result.tasks.get(taskId('A'))?.issues[0]?.code).toBe('dependency-cycle');
    expect(datesOf(result, 'A')[0]).toBe('2026-11-23');
  });

  it('returns an empty range without tasks', () => {
    expect(run([])).toEqual({ tasks: new Map(), range: null, progress: 0 });
  });

  it('schedules 1000 linked tasks quickly', () => {
    const tasks = Array.from({ length: 1000 }, (_, index) =>
      leaf(String(index), 1 + (index % 5), { order: index }),
    );
    const links = tasks.slice(1).map((_, index) => makeLink(String(index), String(index + 1)));
    const started = performance.now();
    const result = run(tasks, links);
    const elapsed = performance.now() - started;
    expect(result.tasks.size).toBe(1000);
    expect(elapsed).toBeLessThan(2000);
  });
});

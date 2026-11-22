import { describe, expect, it } from 'vitest';

import { createWorkCalendar, DEFAULT_CALENDAR } from '@/features/schedule/lib/calendar';
import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';
import type { ScheduledTask } from '@/types/schedule';

import { getBarChange, getSnapDays, snapDelta } from '../barDrag';

const calendar = createWorkCalendar(DEFAULT_CALENDAR);
const day = (date: string) => isoDateToDay(date as ISODate);

/** Monday 23 → Wednesday 25/11 (3 working days). */
function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'a',
    kind: 'task',
    start: day('2026-11-23'),
    finish: day('2026-11-26'),
    duration: 3,
    progress: 0,
    drivingDependencyId: null,
    issues: [],
    ...overrides,
  };
}

const iso = (value: number) => dayToIsoDate(value);

describe('snapping', () => {
  it('snaps to days, weeks or months depending on the zoom', () => {
    expect(getSnapDays(28)).toBe(1);
    expect(getSnapDays(1.6)).toBe(7);
    expect(getSnapDays(0.33)).toBe(30);
  });

  it('rounds a pixel delta to whole steps', () => {
    expect(snapDelta(55, 20)).toBe(3);
    expect(snapDelta(-41, 20)).toBe(-2);
    expect(snapDelta(4, 20)).toBe(0);
    expect(snapDelta(9 * 1.6, 1.6)).toBe(7);
  });
});

describe('getBarChange', () => {
  it('moves a task keeping its working-day duration, across a weekend', () => {
    const change = getBarChange(task(), 'move', 3, calendar);
    // Thursday 26 + 3 working days: Thu, Fri, Mon → finish Tuesday 01/12.
    expect(change?.patch).toEqual({ start: '2026-11-26' });
    expect(iso(change?.finish ?? 0)).toBe('2026-12-01');
  });

  it('moves onto the next working day when dropped on a weekend', () => {
    expect(getBarChange(task(), 'move', 5, calendar)?.patch).toEqual({ start: '2026-11-30' });
  });

  it('stretches the finish, counting working days only', () => {
    // New last day: Monday 30 → Mon 23 … Mon 30 = 6 working days.
    expect(getBarChange(task(), 'finish', 5, calendar)?.patch).toEqual({ duration: 6 });
  });

  it('never shrinks below one working day', () => {
    expect(getBarChange(task(), 'finish', -10, calendar)?.patch).toEqual({ duration: 1 });
    const fromStart = getBarChange(task(), 'start', 10, calendar);
    expect(fromStart?.patch).toEqual({ start: '2026-11-25', duration: 1 });
  });

  it('moves the start edge keeping the finish', () => {
    // Start on Thursday 19: Thu, Fri, Mon, Tue, Wed = 5 working days.
    const change = getBarChange(task(), 'start', -4, calendar);
    expect(change?.patch).toEqual({ start: '2026-11-19', duration: 5 });
    expect(change?.finish).toBe(task().finish);
  });

  it('only moves milestones and never changes summaries', () => {
    const milestone = task({ kind: 'milestone', finish: day('2026-11-23'), duration: 0 });
    expect(getBarChange(milestone, 'finish', 1, calendar)?.patch).toEqual({ start: '2026-11-24' });
    expect(getBarChange(task({ kind: 'summary' }), 'move', 2, calendar)).toBeNull();
  });

  it('returns null when nothing changes', () => {
    expect(getBarChange(task(), 'move', 0, calendar)).toBeNull();
    // Friday moved by 1 lands on Saturday, which snaps back to the next working day.
    const friday = task({ start: day('2026-11-27'), finish: day('2026-11-28'), duration: 1 });
    expect(getBarChange(friday, 'move', 1, calendar)?.patch).toEqual({ start: '2026-11-30' });
    expect(getBarChange(friday, 'finish', 0, calendar)).toBeNull();
  });
});

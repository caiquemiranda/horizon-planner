import { describe, expect, it } from 'vitest';

import { dayToIsoDate, getWeekday, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';

import { createWorkCalendar, DEFAULT_CALENDAR } from '../calendar';

const day = (date: string) => isoDateToDay(date as ISODate);
const iso = (value: number) => dayToIsoDate(value);

const weekdays = createWorkCalendar(DEFAULT_CALENDAR);

describe('createWorkCalendar', () => {
  it('treats Monday to Friday as working days by default', () => {
    expect(getWeekday(day('2026-11-23'))).toBe(1);
    expect(weekdays.isWorkingDay(day('2026-11-23'))).toBe(true);
    expect(weekdays.isWorkingDay(day('2026-11-27'))).toBe(true);
    expect(weekdays.isWorkingDay(day('2026-11-28'))).toBe(false);
    expect(weekdays.isWorkingDay(day('2026-11-29'))).toBe(false);
  });

  it('skips configured holidays', () => {
    const calendar = createWorkCalendar({
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [{ date: '2026-11-20' as ISODate, name: 'Consciência Negra' }],
    });

    expect(calendar.isWorkingDay(day('2026-11-20'))).toBe(false);
    expect(iso(calendar.nextWorkingDay(day('2026-11-20')))).toBe('2026-11-23');
    expect(iso(calendar.previousWorkingDay(day('2026-11-20')))).toBe('2026-11-19');
  });

  it('rejects a calendar without working weekdays', () => {
    expect(() => createWorkCalendar({ workingWeekdays: [], holidays: [] })).toThrow(RangeError);
  });

  describe('spec 13.1: A (2 days) → B (3 days) → C, Monday to Friday', () => {
    it('places each task on working days, across the weekend', () => {
      const aStart = day('2026-11-23');
      const aFinish = weekdays.finishFor(aStart, 2);
      // A occupies Monday and Tuesday; its exclusive finish is Wednesday.
      expect(iso(aFinish)).toBe('2026-11-25');

      const bStart = weekdays.nextWorkingDay(aFinish);
      const bFinish = weekdays.finishFor(bStart, 3);
      expect(iso(bStart)).toBe('2026-11-25');
      // B occupies Wednesday to Friday; its exclusive finish is Saturday 28/11.
      expect(iso(bFinish)).toBe('2026-11-28');

      // C starts on the next working day: Monday 30/11.
      expect(iso(weekdays.nextWorkingDay(bFinish))).toBe('2026-11-30');
    });
  });

  it('counts a duration from the next working day when starting on a weekend', () => {
    expect(iso(weekdays.finishFor(day('2026-11-28'), 1))).toBe('2026-12-01');
  });

  it('keeps milestones at their start', () => {
    expect(weekdays.finishFor(day('2026-11-23'), 0)).toBe(day('2026-11-23'));
  });

  it('crosses month and year boundaries, including leap days', () => {
    expect(iso(weekdays.finishFor(day('2026-12-30'), 3))).toBe('2027-01-02');
    expect(iso(weekdays.finishFor(day('2028-02-28'), 2))).toBe('2028-03-01');
    expect(weekdays.countWorkingDays(day('2028-02-28'), day('2028-03-01'))).toBe(2);
  });

  it('is not affected by daylight saving time (tests run in America/New_York)', () => {
    // US DST ends on 01/11/2026 and Brazil has no DST; day numbers ignore both.
    expect(iso(weekdays.finishFor(day('2026-10-30'), 2))).toBe('2026-11-03');
  });

  it('finds the latest start for a finish (inverse of finishFor)', () => {
    const finish = day('2026-11-28');
    const start = weekdays.startFor(finish, 3);
    expect(iso(start)).toBe('2026-11-25');
    expect(weekdays.finishFor(start, 3)).toBe(finish);
  });

  it('counts working days in half-open ranges', () => {
    expect(weekdays.countWorkingDays(day('2026-11-23'), day('2026-11-30'))).toBe(5);
    expect(weekdays.countWorkingDays(day('2026-11-30'), day('2026-11-23'))).toBe(-5);
    expect(weekdays.countWorkingDays(day('2026-11-28'), day('2026-11-28'))).toBe(0);
  });

  it('shifts boundaries by lags and leads in working days', () => {
    const friday = day('2026-11-27');
    const saturday = day('2026-11-28');
    expect(iso(weekdays.shiftBoundary(saturday, 0))).toBe('2026-11-28');
    // Two working days after Friday's end: Monday and Tuesday are skipped.
    expect(iso(weekdays.shiftBoundary(saturday, 2))).toBe('2026-12-02');
    // One working day lead before Friday's end: the boundary moves to Friday's start.
    expect(iso(weekdays.shiftBoundary(saturday, -1))).toBe('2026-11-27');
    expect(iso(weekdays.shiftBoundary(friday, -1))).toBe('2026-11-26');
  });

  it('supports custom working weeks', () => {
    const sixDays = createWorkCalendar({ workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [] });
    expect(iso(sixDays.finishFor(day('2026-11-27'), 2))).toBe('2026-11-29');
  });
});

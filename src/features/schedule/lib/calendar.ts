import { getWeekday, isoDateToDay } from '@/features/timeline/lib/time';
import type { ProjectCalendar, Weekday } from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

/**
 * Working-day arithmetic on integer day numbers.
 *
 * Convention: a task occupies the half-open range `[start, finish)`. `start` is a working
 * day and `finish` is the day after the last working day, so a task of 2 working days
 * starting on Monday 23/11/2026 has `finish` = Wednesday 25/11 and is shown as
 * "23/11 – 24/11". A milestone (0 days) has `finish === start`.
 *
 * Day numbers come from calendar dates (`Date.UTC`), so timezones and daylight saving
 * time never shift a day.
 */

export const DEFAULT_CALENDAR: ProjectCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

export const WEEKDAY_LABELS: Record<Weekday, { short: string; long: string }> = {
  0: { short: 'Dom', long: 'Domingo' },
  1: { short: 'Seg', long: 'Segunda-feira' },
  2: { short: 'Ter', long: 'Terça-feira' },
  3: { short: 'Qua', long: 'Quarta-feira' },
  4: { short: 'Qui', long: 'Quinta-feira' },
  5: { short: 'Sex', long: 'Sexta-feira' },
  6: { short: 'Sáb', long: 'Sábado' },
};

export interface WorkCalendar {
  isWorkingDay(day: DayNumber): boolean;
  /** `day` itself when it is a working day, otherwise the next one. */
  nextWorkingDay(day: DayNumber): DayNumber;
  /** `day` itself when it is a working day, otherwise the previous one. */
  previousWorkingDay(day: DayNumber): DayNumber;
  /** Exclusive finish of a task of `duration` working days starting at `start`. */
  finishFor(start: DayNumber, duration: number): DayNumber;
  /** Latest start that still ends by the exclusive `finish` with `duration` working days. */
  startFor(finish: DayNumber, duration: number): DayNumber;
  /** Working days in `[from, to)`; negative when `to < from`. */
  countWorkingDays(from: DayNumber, to: DayNumber): number;
  /**
   * Moves a boundary by `amount` working days (lag/lead). A boundary is a position
   * between days, e.g. a start or an exclusive finish; positive moves forward.
   */
  shiftBoundary(boundary: DayNumber, amount: number): DayNumber;
}

/** Safety net: no valid calendar needs to scan more than this many days in one call. */
const MAX_SCAN_DAYS = 366 * 50;

function assertScanned(steps: number) {
  if (steps > MAX_SCAN_DAYS) {
    throw new RangeError('O calendário não tem dias úteis suficientes para este cálculo.');
  }
}

export function createWorkCalendar(calendar: ProjectCalendar): WorkCalendar {
  const weekdays = new Set<number>(calendar.workingWeekdays);
  const holidays = new Set(calendar.holidays.map((holiday) => isoDateToDay(holiday.date)));

  if (weekdays.size === 0) {
    throw new RangeError('O calendário precisa de pelo menos um dia útil na semana.');
  }

  const isWorkingDay = (day: DayNumber) => weekdays.has(getWeekday(day)) && !holidays.has(day);

  const nextWorkingDay = (day: DayNumber) => {
    let current = day;
    let steps = 0;
    while (!isWorkingDay(current)) {
      current += 1;
      assertScanned((steps += 1));
    }
    return current;
  };

  const previousWorkingDay = (day: DayNumber) => {
    let current = day;
    let steps = 0;
    while (!isWorkingDay(current)) {
      current -= 1;
      assertScanned((steps += 1));
    }
    return current;
  };

  const finishFor = (start: DayNumber, duration: number) => {
    if (duration <= 0) return start;
    let current = nextWorkingDay(start);
    let remaining = duration - 1;
    let steps = 0;
    while (remaining > 0) {
      current += 1;
      if (isWorkingDay(current)) remaining -= 1;
      assertScanned((steps += 1));
    }
    return current + 1;
  };

  const startFor = (finish: DayNumber, duration: number) => {
    if (duration <= 0) return nextWorkingDay(finish);
    let current = finish;
    let remaining = duration;
    let steps = 0;
    while (remaining > 0) {
      current -= 1;
      if (isWorkingDay(current)) remaining -= 1;
      assertScanned((steps += 1));
    }
    return current;
  };

  const countWorkingDays = (from: DayNumber, to: DayNumber): number => {
    if (to < from) return -countWorkingDays(to, from);
    assertScanned(to - from);
    let count = 0;
    for (let day = from; day < to; day += 1) {
      if (isWorkingDay(day)) count += 1;
    }
    return count;
  };

  const shiftBoundary = (boundary: DayNumber, amount: number) => {
    if (amount === 0) return boundary;
    // Forward: skip `amount` working days that start at or after the boundary.
    // Backward: step over `amount` working days that end at or before it.
    return amount > 0 ? finishFor(boundary, amount) : startFor(boundary, -amount);
  };

  return {
    isWorkingDay,
    nextWorkingDay,
    previousWorkingDay,
    finishFor,
    startFor,
    countWorkingDays,
    shiftBoundary,
  };
}

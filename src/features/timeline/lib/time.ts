import type { ISODate } from '@/types/project';
import type { DayNumber } from '@/types/timeline';

/**
 * Conversions between calendar values and day numbers.
 *
 * Day numbers are computed from calendar components with `Date.UTC`, so a day is always
 * exactly one unit long, regardless of the user's timezone or daylight saving changes.
 * Local `Date` objects are only used at the edges (today, date-fns formatting).
 */

export const MS_PER_DAY = 86_400_000;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-01-10` → integer day number. */
export function isoDateToDay(date: ISODate): DayNumber {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid ISO date: "${date}"`);

  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY;
}

/** Day number → `yyyy-MM-dd`. Fractional days are floored to their calendar day. */
export function dayToIsoDate(day: DayNumber): ISODate {
  return new Date(Math.floor(day) * MS_PER_DAY).toISOString().slice(0, 10) as ISODate;
}

/**
 * Local `Date` → day number of its calendar date.
 * With `withTime`, the time of day is added as a fraction (used by the "today" line).
 */
export function localDateToDay(date: Date, { withTime = false } = {}): DayNumber {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;

  if (!withTime) return day;

  const secondsIntoDay = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  return day + secondsIntoDay / 86_400;
}

/** Day number → local `Date` at midnight of that calendar day (for date-fns). */
export function dayToLocalDate(day: DayNumber): Date {
  const utc = new Date(Math.floor(day) * MS_PER_DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/** Current moment as a fractional day number. */
export function getTodayDay(now: Date = new Date()): DayNumber {
  return localDateToDay(now, { withTime: true });
}

/** Today's calendar date as `yyyy-MM-dd`, in the user's timezone. */
export function getTodayIsoDate(now: Date = new Date()): ISODate {
  return dayToIsoDate(localDateToDay(now));
}

/**
 * Inclusive calendar range → half-open day range `[start, end)`.
 * A project ending on `2026-01-31` covers that whole day, so `end` is the next day.
 */
export function isoRangeToDays(
  startDate: ISODate,
  endDate: ISODate,
): { start: DayNumber; end: DayNumber } {
  return { start: isoDateToDay(startDate), end: isoDateToDay(endDate) + 1 };
}

/** Day of the week of a day number: 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export function getWeekday(day: DayNumber): number {
  return (((Math.floor(day) + 4) % 7) + 7) % 7;
}

import { describe, expect, it } from 'vitest';

import type { ISODate } from '@/types/project';

import {
  dayToIsoDate,
  dayToLocalDate,
  getTodayIsoDate,
  isoDateToDay,
  isoRangeToDays,
  localDateToDay,
} from '../time';

const iso = (value: string) => value as ISODate;

describe('test environment', () => {
  it('runs in a timezone with daylight saving time', () => {
    const winter = new Date(2026, 0, 15).getTimezoneOffset();
    const summer = new Date(2026, 6, 15).getTimezoneOffset();
    expect(winter).not.toBe(summer);
  });
});

describe('isoDateToDay / dayToIsoDate', () => {
  it('uses the Unix epoch as day zero', () => {
    expect(isoDateToDay(iso('1970-01-01'))).toBe(0);
    expect(isoDateToDay(iso('1970-01-02'))).toBe(1);
    expect(isoDateToDay(iso('1969-12-31'))).toBe(-1);
  });

  it('handles leap years', () => {
    expect(isoDateToDay(iso('2024-03-01')) - isoDateToDay(iso('2024-02-28'))).toBe(2);
    expect(isoDateToDay(iso('2026-03-01')) - isoDateToDay(iso('2026-02-28'))).toBe(1);
  });

  it.each(['2026-01-01', '2024-02-29', '2026-03-08', '2026-11-01', '1999-12-31', '2100-06-15'])(
    'round-trips %s',
    (value) => {
      expect(dayToIsoDate(isoDateToDay(iso(value)))).toBe(value);
    },
  );

  it('floors fractional days to their calendar day', () => {
    const day = isoDateToDay(iso('2026-05-05'));
    expect(dayToIsoDate(day + 0.99)).toBe('2026-05-05');
  });

  it('rejects malformed dates', () => {
    expect(() => isoDateToDay(iso('05/05/2026'))).toThrow(RangeError);
  });
});

describe('localDateToDay / dayToLocalDate', () => {
  it.each([
    ['spring forward', new Date(2026, 2, 7), new Date(2026, 2, 8), new Date(2026, 2, 9)],
    ['fall back', new Date(2026, 9, 31), new Date(2026, 10, 1), new Date(2026, 10, 2)],
  ])('keeps days exactly one unit apart across DST (%s)', (_label, before, transition, after) => {
    expect(localDateToDay(transition) - localDateToDay(before)).toBe(1);
    expect(localDateToDay(after) - localDateToDay(transition)).toBe(1);
  });

  it('matches the ISO conversion for the same calendar date', () => {
    expect(localDateToDay(new Date(2026, 2, 8, 23, 30))).toBe(isoDateToDay(iso('2026-03-08')));
  });

  it('adds the time of day as a fraction when requested', () => {
    const day = localDateToDay(new Date(2026, 0, 10, 12, 0, 0), { withTime: true });
    expect(day).toBe(isoDateToDay(iso('2026-01-10')) + 0.5);
  });

  it('returns local midnight of the calendar day', () => {
    const date = dayToLocalDate(isoDateToDay(iso('2026-03-08')) + 0.7);
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 2, 8, 0,
    ]);
  });

  it('round-trips through local dates around DST', () => {
    const start = isoDateToDay(iso('2026-03-01'));
    for (let day = start; day < start + 250; day += 1) {
      expect(localDateToDay(dayToLocalDate(day))).toBe(day);
    }
  });
});

describe('helpers', () => {
  it('formats today in the local timezone', () => {
    expect(getTodayIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('turns an inclusive date range into a half-open day range', () => {
    const range = isoRangeToDays(iso('2026-01-01'), iso('2026-01-31'));
    expect(range.end - range.start).toBe(31);
  });
});

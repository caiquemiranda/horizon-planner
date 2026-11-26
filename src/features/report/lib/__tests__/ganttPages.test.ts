import { describe, expect, it } from 'vitest';

import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';

import {
  getGanttSpan,
  monthTicks,
  planGanttPages,
  PRINT_MAX_DAYS,
  splitRows,
  splitTimeline,
} from '../ganttPages';

const day = (iso: string) => isoDateToDay(iso as ISODate);

describe('monthTicks', () => {
  it('lists the first day of each month inside the span', () => {
    expect(monthTicks(day('2027-01-15'), day('2027-03-01'))).toEqual([
      { day: day('2027-02-01'), label: 'fev 2027' },
      { day: day('2027-03-01'), label: 'mar 2027' },
    ]);
  });

  it('crosses the year', () => {
    expect(monthTicks(day('2026-12-01'), day('2027-01-10')).map((tick) => tick.label)).toEqual([
      'dez 2026',
      'jan 2027',
    ]);
  });
});

describe('getGanttSpan', () => {
  it('leaves two days on each side of the plan', () => {
    expect(getGanttSpan({ start: 100, finish: 140 })).toEqual({ from: 98, to: 142 });
  });
});

describe('splitTimeline', () => {
  it('keeps a short plan on one page', () => {
    expect(splitTimeline(0, 90)).toEqual([{ from: 0, to: 90 }]);
  });

  it('covers a long plan without gaps or overlaps, each page within the limit', () => {
    const from = day('2027-01-10');
    const to = day('2028-09-20');
    const windows = splitTimeline(from, to);
    expect(windows[0]?.from).toBe(from);
    expect(windows.at(-1)?.to).toBe(to);
    for (const [index, window] of windows.entries()) {
      expect(window.to - window.from).toBeLessThanOrEqual(PRINT_MAX_DAYS);
      if (index > 0) expect(window.from).toBe(windows[index - 1]?.to);
    }
  });

  it('cuts on the first day of a month', () => {
    const windows = splitTimeline(day('2027-01-10'), day('2028-09-20'));
    for (const window of windows.slice(1)) {
      expect(dayToIsoDate(window.from).endsWith('-01')).toBe(true);
    }
  });

  it('falls back to a plain cut when no month starts inside the limit', () => {
    expect(splitTimeline(day('2027-01-02'), day('2027-01-30'), 10)).toEqual([
      { from: day('2027-01-02'), to: day('2027-01-12') },
      { from: day('2027-01-12'), to: day('2027-01-22') },
      { from: day('2027-01-22'), to: day('2027-01-30') },
    ]);
  });
});

describe('splitRows', () => {
  it('balances the chunks instead of leaving a nearly empty last page', () => {
    expect(splitRows(40, 36)).toEqual([
      { start: 0, end: 20 },
      { start: 20, end: 40 },
    ]);
  });

  it('keeps every row exactly once', () => {
    const ranges = splitRows(101, 36);
    expect(ranges.reduce((sum, range) => sum + range.end - range.start, 0)).toBe(101);
    expect(ranges.every((range) => range.end - range.start <= 36)).toBe(true);
  });

  it('has no page for no rows', () => {
    expect(splitRows(0)).toEqual([]);
  });
});

describe('planGanttPages', () => {
  it('is one page for a small plan', () => {
    expect(planGanttPages({ from: 0, to: 60 }, 14)).toEqual([
      { window: { from: 0, to: 60 }, rows: { start: 0, end: 14 } },
    ]);
  });

  it('reads every time window of the first rows before the next rows', () => {
    const pages = planGanttPages({ from: 0, to: 30 }, 6, { maxDays: 20, maxRows: 3 });
    expect(pages.map((page) => [page.rows.start, page.window.from])).toEqual([
      [0, 0],
      [0, 20],
      [3, 0],
      [3, 20],
    ]);
  });
});

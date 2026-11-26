import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';

/**
 * How the report's Gantt is cut for paper (spec 3.6, REQ-PRINT-02): a long plan prints as
 * pages of at most `maxRows` rows and `maxDays` days, each with its own ruler, task codes
 * and legend, so nothing is squeezed past reading or left out. Time cuts fall on the first
 * day of a month when one fits, so no page starts in the middle of a month it cannot show.
 */

/** Days around the plan, so the first and last bars do not touch the frame. */
export const GANTT_PADDING_DAYS = 2;
/** About six months on an A4 portrait page (~4 px a day). */
export const PRINT_MAX_DAYS = 184;
/** Rows that fit an A4 portrait page with the ruler, caption and legend. */
export const PRINT_MAX_ROWS = 36;

/** Days `[from, to)`: `to` is the first day after the window. */
export interface DayWindow {
  from: number;
  to: number;
}

/** Rows `[start, end)` of the expanded plan. */
export interface RowRange {
  start: number;
  end: number;
}

export interface GanttPage {
  window: DayWindow;
  rows: RowRange;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** The chart span for a plan: its dates and a little room on each side. */
export function getGanttSpan(range: { start: number; finish: number }): DayWindow {
  return { from: range.start - GANTT_PADDING_DAYS, to: range.finish + GANTT_PADDING_DAYS };
}

/** First day of every month inside `[from, to]`, labelled "mar 2027". */
export function monthTicks(from: number, to: number): { day: number; label: string }[] {
  const start = dayToIsoDate(from);
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7)) - 1;
  const ticks: { day: number; label: string }[] = [];
  for (;;) {
    const day = isoDateToDay(`${String(year)}-${String(month + 1).padStart(2, '0')}-01` as ISODate);
    if (day > to) break;
    if (day >= from) ticks.push({ day, label: `${MONTHS[month] ?? ''} ${String(year)}` });
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return ticks;
}

/** Consecutive windows covering `[from, to)`, each at most `maxDays` long. */
export function splitTimeline(from: number, to: number, maxDays = PRINT_MAX_DAYS): DayWindow[] {
  const windows: DayWindow[] = [];
  let cursor = from;
  while (cursor < to) {
    const limit = cursor + maxDays;
    if (limit >= to) {
      windows.push({ from: cursor, to });
      break;
    }
    // The last month start that still fits; a plain cut when none does.
    const starts = monthTicks(cursor + 1, limit);
    const cut = starts.at(-1)?.day ?? limit;
    windows.push({ from: cursor, to: cut });
    cursor = cut;
  }
  return windows;
}

/** `count` rows in balanced chunks of at most `maxRows` (no nearly empty last page). */
export function splitRows(count: number, maxRows = PRINT_MAX_ROWS): RowRange[] {
  if (count <= 0) return [];
  const chunks = Math.ceil(count / maxRows);
  const size = Math.ceil(count / chunks);
  const ranges: RowRange[] = [];
  for (let start = 0; start < count; start += size) {
    ranges.push({ start, end: Math.min(count, start + size) });
  }
  return ranges;
}

/** Pages in reading order: every time window of the first rows, then the next rows. */
export function planGanttPages(
  span: DayWindow,
  rowCount: number,
  limits: { maxDays?: number; maxRows?: number } = {},
): GanttPage[] {
  const windows = splitTimeline(span.from, span.to, limits.maxDays);
  return splitRows(rowCount, limits.maxRows).flatMap((rows) =>
    windows.map((window) => ({ window, rows })),
  );
}

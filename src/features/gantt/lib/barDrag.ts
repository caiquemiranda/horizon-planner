import type { WorkCalendar } from '@/features/schedule/lib/calendar';
import type { TaskPatch } from '@/features/schedule/lib/commands';
import { dayToIsoDate } from '@/features/timeline/lib/time';
import type { ScheduledTask } from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

/**
 * Turning a bar gesture into a task change. Pure: pixels only enter here as a snapped
 * number of days; dates stay the source of truth (the engine computes the final ones).
 *
 * - move: the requested start shifts; the duration in working days is kept;
 * - finish: the end edge moves; the start is kept and the duration changes;
 * - start: the start edge moves; the end is kept and the duration changes.
 */

export type BarDragMode = 'move' | 'start' | 'finish';

/**
 * Snap step in days for the current zoom, never finer than what the scale can show:
 * days when a day is wide enough to target, weeks when zoomed out, ~months beyond.
 */
export function getSnapDays(pxPerDay: number): number {
  if (pxPerDay >= 4) return 1;
  if (pxPerDay >= 0.6) return 7;
  return 30;
}

/** Snapped whole days for a horizontal drag of `deltaPx`. */
export function snapDelta(deltaPx: number, pxPerDay: number): number {
  const step = getSnapDays(pxPerDay);
  const days = Math.round(deltaPx / pxPerDay / step) * step;
  return Object.is(days, -0) ? 0 : days;
}

export interface BarChange {
  patch: TaskPatch;
  /** Preview of the result, before links are applied by the engine. */
  start: DayNumber;
  finish: DayNumber;
}

/**
 * The change for dragging `task` by `deltaDays` in `mode`, or `null` when nothing would
 * change. Resizing never goes below one working day (use "Converter em marco" for zero).
 */
export function getBarChange(
  task: ScheduledTask,
  mode: BarDragMode,
  deltaDays: number,
  calendar: WorkCalendar,
): BarChange | null {
  if (deltaDays === 0 || task.kind === 'summary') return null;

  if (mode === 'move' || task.kind === 'milestone') {
    const start = calendar.nextWorkingDay(task.start + deltaDays);
    if (start === task.start) return null;
    return {
      patch: { start: dayToIsoDate(start) },
      start,
      finish: calendar.finishFor(start, task.duration),
    };
  }

  if (mode === 'finish') {
    // The last working day may not go before the first one.
    const lastDay = Math.max(task.start, task.finish - 1 + deltaDays);
    const duration = Math.max(1, calendar.countWorkingDays(task.start, lastDay + 1));
    if (duration === task.duration) return null;
    return {
      patch: { duration },
      start: task.start,
      finish: calendar.finishFor(task.start, duration),
    };
  }

  const lastDay = task.finish - 1;
  const start = calendar.nextWorkingDay(Math.min(lastDay, task.start + deltaDays));
  const duration = Math.max(1, calendar.countWorkingDays(start, task.finish));
  if (start === task.start) return null;
  return {
    patch: { start: dayToIsoDate(start), duration },
    start,
    finish: calendar.finishFor(start, duration),
  };
}

import { describe, expect, it } from 'vitest';

import { xToDay } from '@/features/timeline/lib/scale';
import { isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';
import type { ScheduledTask } from '@/types/schedule';
import type { Viewport } from '@/types/timeline';

import { GANTT_METRICS, getBarGeometry, isHorizontallyVisible } from '../geometry';

const MONDAY = isoDateToDay('2026-11-23' as ISODate);
const viewport: Viewport = { startDay: MONDAY - 3, pxPerDay: 20, widthPx: 800 };

function task(overrides: Partial<ScheduledTask>): ScheduledTask {
  return {
    id: 'a',
    kind: 'task',
    start: MONDAY,
    finish: MONDAY + 2,
    duration: 2,
    progress: 0,
    drivingDependencyId: null,
    issues: [],
    ...overrides,
  };
}

describe('getBarGeometry', () => {
  it('spans [start, finish) on the shared scale', () => {
    const bar = getBarGeometry(task({}), 0, viewport, 36);
    expect(bar.x).toBe(60);
    expect(bar.width).toBe(40);
    // The inverse function maps the edges back to the task's days.
    expect(xToDay(bar.x, viewport)).toBe(MONDAY);
    expect(xToDay(bar.x + bar.width, viewport)).toBe(MONDAY + 2);
  });

  it('places each row at the same Y as the table row', () => {
    const bar = getBarGeometry(task({}), 3, viewport, 36);
    expect(bar.centerY).toBe(3 * 36 + 18);
    expect(bar.top).toBe(bar.centerY - GANTT_METRICS.barHeight / 2);
  });

  it('includes weekends inside a task that crosses them', () => {
    // Wed 25 → Fri 27 is 3 working days, then Monday 30: finish is Tuesday 01/12.
    const crossing = task({ start: MONDAY + 2, finish: MONDAY + 8, duration: 4 });
    expect(getBarGeometry(crossing, 0, viewport, 36).width).toBe(6 * 20);
  });

  it('draws summaries thinner and milestones as a point', () => {
    expect(getBarGeometry(task({ kind: 'summary' }), 0, viewport, 36).height).toBe(
      GANTT_METRICS.summaryHeight,
    );
    const milestone = getBarGeometry(
      task({ kind: 'milestone', finish: MONDAY, duration: 0 }),
      0,
      viewport,
      36,
    );
    expect(milestone).toMatchObject({ x: 60, width: 0, height: GANTT_METRICS.milestoneSize });
  });

  it('keeps very short bars visible at low zoom', () => {
    const zoomedOut = { ...viewport, pxPerDay: 0.5 };
    expect(getBarGeometry(task({}), 0, zoomedOut, 36).width).toBe(GANTT_METRICS.minBarWidth);
  });

  it('scales consistently when zooming', () => {
    const zoomed = { ...viewport, pxPerDay: 80 };
    const bar = getBarGeometry(task({}), 0, zoomed, 36);
    expect(bar.width).toBe(160);
    expect(xToDay(bar.x, zoomed)).toBe(MONDAY);
  });
});

describe('isHorizontallyVisible', () => {
  it('skips bars far outside the view', () => {
    const far = task({ start: MONDAY + 400, finish: MONDAY + 402 });
    expect(isHorizontallyVisible(getBarGeometry(far, 0, viewport, 36), viewport)).toBe(false);
    expect(isHorizontallyVisible(getBarGeometry(task({}), 0, viewport, 36), viewport)).toBe(true);
  });
});

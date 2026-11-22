import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZOOM_LIMITS } from '@/types/timeline';

import { dayToX } from '../../lib/scale';
import { getTodayDay } from '../../lib/time';
import {
  createInitialViewport,
  INITIAL_DAYS_BEFORE_TODAY,
  INITIAL_PX_PER_DAY,
  useViewportStore,
} from '../viewportStore';

const NOW = new Date(2026, 2, 15, 12, 0, 0);

function getViewport() {
  return useViewportStore.getState().viewport;
}

describe('viewportStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    useViewportStore.setState({
      viewport: { startDay: 20_000, pxPerDay: 10, widthPx: 1000 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the "months" zoom with today near the left edge', () => {
    const viewport = createInitialViewport(NOW);

    expect(viewport.pxPerDay).toBe(INITIAL_PX_PER_DAY);
    expect(viewport.widthPx).toBe(0);
    expect(Math.floor(getTodayDay(NOW)) - viewport.startDay).toBe(INITIAL_DAYS_BEFORE_TODAY);
  });

  it('updates the width keeping the left edge', () => {
    useViewportStore.getState().setWidth(1400);

    expect(getViewport()).toEqual({ startDay: 20_000, pxPerDay: 10, widthPx: 1400 });
  });

  it('keeps the same state object when the width does not change', () => {
    const before = getViewport();
    useViewportStore.getState().setWidth(1000);

    expect(getViewport()).toBe(before);
  });

  it('zooms around an anchor', () => {
    const anchorDay = 20_000 + 250 / 10;
    useViewportStore.getState().zoomAt(250, 2);

    expect(getViewport().pxPerDay).toBe(20);
    expect(dayToX(anchorDay, getViewport())).toBeCloseTo(250);
  });

  it('clamps absolute zoom to the limits', () => {
    useViewportStore.getState().zoomTo(10_000);
    expect(getViewport().pxPerDay).toBe(ZOOM_LIMITS.max);
  });

  it('pans forward in time with positive deltas', () => {
    useViewportStore.getState().panBy(100);
    expect(getViewport().startDay).toBeCloseTo(20_010);
  });

  it('fits a range inside the viewport', () => {
    useViewportStore.getState().fitRange(20_100, 20_200);

    const viewport = getViewport();
    expect(dayToX(20_100, viewport)).toBeGreaterThanOrEqual(0);
    expect(dayToX(20_200, viewport)).toBeLessThanOrEqual(viewport.widthPx);
  });

  it('centers on today', () => {
    useViewportStore.getState().goToToday();

    expect(dayToX(getTodayDay(NOW), getViewport())).toBeCloseTo(500);
  });

  it('centers on an arbitrary day', () => {
    useViewportStore.getState().centerOn(21_000);

    expect(dayToX(21_000, getViewport())).toBeCloseTo(500);
  });
});

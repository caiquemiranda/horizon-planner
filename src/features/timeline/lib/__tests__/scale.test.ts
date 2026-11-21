import { describe, expect, it } from 'vitest';

import { type Viewport, ZOOM_LIMITS } from '@/types/timeline';

import {
  centerOn,
  clampPxPerDay,
  dayToX,
  fitRange,
  getVisibleRange,
  panBy,
  resizeViewport,
  wheelDeltaToZoomFactor,
  xToDay,
  zoomAt,
  zoomTo,
} from '../scale';

const viewport: Viewport = { startDay: 20_000, pxPerDay: 4, widthPx: 1200 };

describe('coordinate conversion', () => {
  it('maps the left edge to x = 0', () => {
    expect(dayToX(viewport.startDay, viewport)).toBe(0);
  });

  it('is linear in pxPerDay', () => {
    expect(dayToX(viewport.startDay + 10, viewport)).toBe(40);
  });

  it.each([-500, 0, 333, 1200, 5000])('round-trips x = %s', (x) => {
    expect(dayToX(xToDay(x, viewport), viewport)).toBeCloseTo(x, 9);
  });

  it('exposes the visible range', () => {
    expect(getVisibleRange(viewport)).toEqual({ from: 20_000, to: 20_300 });
  });
});

describe('zoom', () => {
  it.each([
    [0, 2],
    [600, 2],
    [1100, 0.5],
    [237, 1.37],
    [900, 0.01],
    [10, 1000],
  ])('keeps the day under the cursor fixed (x = %s, factor = %s)', (anchorX, factor) => {
    const anchorDay = xToDay(anchorX, viewport);
    const zoomed = zoomAt(viewport, anchorX, factor);

    expect(dayToX(anchorDay, zoomed)).toBeCloseTo(anchorX, 6);
  });

  it('zooms in with factors above 1 and out below 1', () => {
    expect(zoomAt(viewport, 0, 2).pxPerDay).toBe(8);
    expect(zoomAt(viewport, 0, 0.5).pxPerDay).toBe(2);
  });

  it('clamps to the zoom limits', () => {
    expect(zoomAt(viewport, 0, 1e9).pxPerDay).toBe(ZOOM_LIMITS.max);
    expect(zoomAt(viewport, 0, 1e-9).pxPerDay).toBe(ZOOM_LIMITS.min);
    expect(clampPxPerDay(Number.NaN)).toBeNaN();
  });

  it('anchors absolute zoom on the center by default', () => {
    const centerDay = xToDay(viewport.widthPx / 2, viewport);
    const zoomed = zoomTo(viewport, 40);

    expect(zoomed.pxPerDay).toBe(40);
    expect(dayToX(centerDay, zoomed)).toBeCloseTo(viewport.widthPx / 2, 6);
  });

  it('turns wheel deltas into symmetric multiplicative factors', () => {
    expect(wheelDeltaToZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelDeltaToZoomFactor(100)).toBeLessThan(1);
    expect(wheelDeltaToZoomFactor(100) * wheelDeltaToZoomFactor(-100)).toBeCloseTo(1, 12);
    expect(wheelDeltaToZoomFactor(0)).toBe(1);
  });
});

describe('navigation', () => {
  it('pans forward in time with positive deltas', () => {
    expect(panBy(viewport, 40).startDay).toBe(20_010);
    expect(panBy(viewport, -40).startDay).toBe(19_990);
  });

  it('centers a day in the middle of the viewport', () => {
    const centered = centerOn(viewport, 25_000);
    expect(dayToX(25_000, centered)).toBe(viewport.widthPx / 2);
    expect(centered.pxPerDay).toBe(viewport.pxPerDay);
  });

  it('fits a range inside the padded width', () => {
    const fitted = fitRange(viewport, 21_000, 21_100, 50);

    expect(dayToX(21_000, fitted)).toBeCloseTo(50, 6);
    expect(dayToX(21_100, fitted)).toBeCloseTo(1150, 6);
  });

  it('fits an empty range as a single day', () => {
    const fitted = fitRange(viewport, 21_000, 21_000);
    expect(Number.isFinite(fitted.pxPerDay)).toBe(true);
    expect(fitted.pxPerDay).toBeLessThanOrEqual(ZOOM_LIMITS.max);
  });

  it('keeps the left edge when resizing', () => {
    expect(resizeViewport(viewport, 800)).toEqual({ ...viewport, widthPx: 800 });
    expect(resizeViewport(viewport, -10).widthPx).toBe(0);
  });

  it('never mutates the input viewport', () => {
    const snapshot = { ...viewport };
    zoomAt(viewport, 100, 3);
    panBy(viewport, 100);
    centerOn(viewport, 0);
    fitRange(viewport, 0, 10);
    expect(viewport).toEqual(snapshot);
  });
});

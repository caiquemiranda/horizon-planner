import { type DayNumber, type Viewport, ZOOM_LIMITS } from '@/types/timeline';

/**
 * Pure viewport math. Every function returns a new viewport and never mutates its input.
 *
 *   x = (day - startDay) * pxPerDay
 */

export function clampPxPerDay(pxPerDay: number): number {
  return Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, pxPerDay));
}

export function dayToX(day: DayNumber, viewport: Viewport): number {
  return (day - viewport.startDay) * viewport.pxPerDay;
}

export function xToDay(x: number, viewport: Viewport): DayNumber {
  return viewport.startDay + x / viewport.pxPerDay;
}

/** Visible range as half-open days `[from, to)`. */
export function getVisibleRange(viewport: Viewport): { from: DayNumber; to: DayNumber } {
  return { from: viewport.startDay, to: xToDay(viewport.widthPx, viewport) };
}

/**
 * Zooms by `factor` keeping the day under `anchorX` on the same pixel.
 * `factor > 1` zooms in (micro), `factor < 1` zooms out (macro).
 */
export function zoomAt(viewport: Viewport, anchorX: number, factor: number): Viewport {
  return zoomTo(viewport, viewport.pxPerDay * factor, anchorX);
}

/** Sets an absolute zoom level, anchored on `anchorX` (defaults to the center). */
export function zoomTo(
  viewport: Viewport,
  pxPerDay: number,
  anchorX: number = viewport.widthPx / 2,
): Viewport {
  const nextPxPerDay = clampPxPerDay(pxPerDay);
  const anchorDay = xToDay(anchorX, viewport);

  return {
    ...viewport,
    pxPerDay: nextPxPerDay,
    startDay: anchorDay - anchorX / nextPxPerDay,
  };
}

/**
 * Moves the view by `deltaPx`. Positive values move forward in time
 * (content slides to the left), matching a wheel / trackpad scroll to the right.
 */
export function panBy(viewport: Viewport, deltaPx: number): Viewport {
  return { ...viewport, startDay: viewport.startDay + deltaPx / viewport.pxPerDay };
}

/** Centers the view on `day` without changing the zoom level. */
export function centerOn(viewport: Viewport, day: DayNumber): Viewport {
  return { ...viewport, startDay: day - viewport.widthPx / 2 / viewport.pxPerDay };
}

/** Zooms and pans so `[from, to)` fits the width, keeping `paddingPx` on each side. */
export function fitRange(
  viewport: Viewport,
  from: DayNumber,
  to: DayNumber,
  paddingPx = 48,
): Viewport {
  const span = Math.max(to - from, 1);
  const usableWidth = Math.max(viewport.widthPx - paddingPx * 2, 1);
  const pxPerDay = clampPxPerDay(usableWidth / span);

  return centerOn({ ...viewport, pxPerDay }, from + span / 2);
}

/** Updates the width (e.g. on resize) keeping the left edge in place. */
export function resizeViewport(viewport: Viewport, widthPx: number): Viewport {
  return { ...viewport, widthPx: Math.max(widthPx, 0) };
}

/**
 * Converts a wheel `deltaY` into a multiplicative zoom factor.
 * Exponential so equal scroll distances feel equal at every zoom level.
 */
export function wheelDeltaToZoomFactor(deltaY: number, sensitivity = 0.0015): number {
  return Math.exp(-deltaY * sensitivity);
}

/**
 * Intermediate viewport between `from` (t = 0) and `to` (t = 1) for smooth transitions.
 * Zoom is interpolated geometrically, so the motion feels constant at every zoom level,
 * and the day under `anchorX` moves linearly. When both viewports share the day under
 * `anchorX` (an anchored zoom), that day stays fixed during the whole transition.
 */
export function interpolateViewport(
  from: Viewport,
  to: Viewport,
  t: number,
  anchorX: number = to.widthPx / 2,
): Viewport {
  if (t <= 0) return from;
  if (t >= 1) return to;

  const pxPerDay = Math.exp(
    Math.log(from.pxPerDay) + (Math.log(to.pxPerDay) - Math.log(from.pxPerDay)) * t,
  );
  const fromAnchorDay = xToDay(anchorX, from);
  const toAnchorDay = xToDay(anchorX, to);
  const anchorDay = fromAnchorDay + (toAnchorDay - fromAnchorDay) * t;

  return { ...to, pxPerDay, startDay: anchorDay - anchorX / pxPerDay };
}

import { wheelDeltaToZoomFactor } from './scale';

/** Pixels per "line" when the browser reports wheel deltas in lines (Firefox). */
const LINE_HEIGHT_PX = 16;

/** The subset of `WheelEvent` the timeline needs (easy to build in tests). */
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** Pointer position relative to the left edge of the time canvas. */
  offsetX: number;
}

export type WheelIntent =
  | { type: 'zoom'; anchorX: number; factor: number; deltaY: number }
  | { type: 'pan'; deltaPx: number }
  | null;

/** Converts line/page deltas to pixels so every device behaves the same. */
export function normalizeWheelDelta(delta: number, deltaMode: number, pageSizePx: number): number {
  if (deltaMode === 1) return delta * LINE_HEIGHT_PX;
  if (deltaMode === 2) return delta * pageSizePx;
  return delta;
}

/**
 * Decides what a wheel event means on the timeline:
 * - `Ctrl`/`⌘` + wheel, and trackpad pinch (reported as `ctrlKey` + wheel), zoom on the cursor;
 * - `Shift` + wheel and horizontal trackpad swipes pan through time;
 * - plain vertical wheel returns `null`, leaving the native vertical scroll of the lanes.
 */
export function interpretWheel(input: WheelInput, canvasWidth: number): WheelIntent {
  const deltaX = normalizeWheelDelta(input.deltaX, input.deltaMode, canvasWidth);
  const deltaY = normalizeWheelDelta(input.deltaY, input.deltaMode, canvasWidth);

  if (input.ctrlKey || input.metaKey) {
    if (deltaY === 0) return null;
    const anchorX = Math.min(Math.max(input.offsetX, 0), canvasWidth);
    return { type: 'zoom', anchorX, factor: wheelDeltaToZoomFactor(deltaY), deltaY };
  }

  if (input.shiftKey) {
    // Some browsers already move Shift + wheel to `deltaX`.
    const deltaPx = deltaX || deltaY;
    return deltaPx === 0 ? null : { type: 'pan', deltaPx };
  }

  if (Math.abs(deltaX) > Math.abs(deltaY)) return { type: 'pan', deltaPx: deltaX };

  return null;
}

export interface Point {
  x: number;
  y: number;
}

/** Distance (px) a pointer must travel before a press becomes a drag instead of a click. */
export const DRAG_THRESHOLD_PX = 4;

export function hasExceededDragThreshold(start: Point, current: Point): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > DRAG_THRESHOLD_PX;
}

/**
 * Change between two consecutive two-finger positions:
 * zoom `factor` around the previous midpoint, plus the midpoint's horizontal movement.
 * Coordinates must be relative to the canvas.
 */
export function getPinchChange(
  previous: readonly [Point, Point],
  next: readonly [Point, Point],
): { anchorX: number; factor: number; panDeltaPx: number } {
  const previousDistance = Math.hypot(previous[1].x - previous[0].x, previous[1].y - previous[0].y);
  const nextDistance = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
  const previousMidX = (previous[0].x + previous[1].x) / 2;
  const nextMidX = (next[0].x + next[1].x) / 2;

  return {
    anchorX: previousMidX,
    factor: previousDistance > 0 ? nextDistance / previousDistance : 1,
    // Fingers moving right drag the content right, i.e. back in time.
    panDeltaPx: previousMidX - nextMidX,
  };
}

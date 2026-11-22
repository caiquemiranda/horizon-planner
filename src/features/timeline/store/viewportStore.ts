import { animate, type AnimationPlaybackControls } from 'motion';
import { create } from 'zustand';

import { DURATION, EASE_OUT_EXPO, prefersReducedMotion } from '@/lib/motion';
import type { DayNumber, Viewport } from '@/types/timeline';

import {
  centerOn,
  fitRange,
  interpolateViewport,
  panBy,
  resizeViewport,
  zoomAt,
  zoomTo,
} from '../lib/scale';
import { ZOOM_PRESETS } from '../lib/ticks';
import { getTodayDay } from '../lib/time';

/** Zoom level on first load: the "Meses" preset. */
export const INITIAL_PX_PER_DAY =
  ZOOM_PRESETS.find((preset) => preset.id === 'months')?.pxPerDay ?? 6.5;

/** How many days of the past are visible to the left of today on first load. */
export const INITIAL_DAYS_BEFORE_TODAY = 30;

export function createInitialViewport(now: Date = new Date()): Viewport {
  return {
    startDay: Math.floor(getTodayDay(now)) - INITIAL_DAYS_BEFORE_TODAY,
    pxPerDay: INITIAL_PX_PER_DAY,
    widthPx: 0,
  };
}

export interface TransitionOptions {
  /** Pixel kept fixed while zooming (defaults to the center). */
  anchorX?: number | undefined;
  /** In seconds; defaults to `DURATION.slow`. */
  duration?: number;
}

export interface ViewportState {
  viewport: Viewport;
  /** Updates the measured width, keeping the left edge in place. */
  setWidth: (widthPx: number) => void;
  /** Jumps to a viewport without animation. */
  setViewport: (viewport: Viewport) => void;
  /** Moves smoothly to a viewport (instantly with reduced motion). */
  animateTo: (viewport: Viewport, options?: TransitionOptions) => void;
  /**
   * Multiplies the zoom by `factor`, keeping the day under `anchorX` fixed.
   * With `smooth`, consecutive calls accumulate on the running transition's target.
   */
  zoomAt: (anchorX: number, factor: number, options?: { smooth?: boolean }) => void;
  /** Multiplies the zoom by `factor` around `anchorX` (center by default). Animated. */
  zoomBy: (factor: number, anchorX?: number) => void;
  /** Sets an absolute zoom level, anchored on the center by default. Animated. */
  zoomTo: (pxPerDay: number, anchorX?: number) => void;
  /**
   * Positive values move forward in time. Immediate by default (follows the pointer),
   * cancelling any transition; with `smooth`, animates and accumulates like `zoomAt`.
   */
  panBy: (deltaPx: number, options?: { smooth?: boolean }) => void;
  /** Animated. */
  centerOn: (day: DayNumber) => void;
  /** Animated. */
  fitRange: (from: DayNumber, to: DayNumber) => void;
  /** Animated. */
  goToToday: () => void;
}

/** The running transition, kept outside React state (it changes every frame). */
let transition: { controls: AnimationPlaybackControls; target: Viewport } | null = null;

function stopTransition() {
  transition?.controls.stop();
  transition = null;
}

/**
 * Timeline viewport (what is visible and at which zoom).
 * All the math lives in `lib/scale`; the store holds state, wires actions and runs
 * the smooth transitions between viewports.
 */
export const useViewportStore = create<ViewportState>()((set, get) => {
  /** Where the view is going: the running transition's target, or the current viewport. */
  const destination = () => transition?.target ?? get().viewport;

  const animateTo: ViewportState['animateTo'] = (target, options = {}) => {
    const from = get().viewport;
    stopTransition();

    if (prefersReducedMotion() || from.widthPx <= 0) {
      set({ viewport: target });
      return;
    }

    const anchorX = options.anchorX ?? target.widthPx / 2;
    const controls = animate(0, 1, {
      duration: options.duration ?? DURATION.slow,
      ease: [...EASE_OUT_EXPO],
      onUpdate: (t) => {
        set({ viewport: interpolateViewport(from, target, t, anchorX) });
      },
      onComplete: () => {
        if (transition?.controls === controls) transition = null;
        set({ viewport: target });
      },
    });
    transition = { controls, target };
  };

  return {
    viewport: createInitialViewport(),

    setWidth: (widthPx) => {
      if (get().viewport.widthPx === widthPx) return;
      stopTransition();
      set((state) => ({ viewport: resizeViewport(state.viewport, widthPx) }));
    },
    setViewport: (viewport) => {
      stopTransition();
      set({ viewport });
    },
    animateTo,
    zoomAt: (anchorX, factor, { smooth = false } = {}) => {
      if (smooth) {
        animateTo(zoomAt(destination(), anchorX, factor), { anchorX, duration: DURATION.base });
        return;
      }
      stopTransition();
      set((state) => ({ viewport: zoomAt(state.viewport, anchorX, factor) }));
    },
    zoomBy: (factor, anchorX) => {
      const target = destination();
      const anchor = anchorX ?? target.widthPx / 2;
      animateTo(zoomAt(target, anchor, factor), { anchorX: anchor });
    },
    zoomTo: (pxPerDay, anchorX) => {
      animateTo(zoomTo(destination(), pxPerDay, anchorX), { anchorX });
    },
    panBy: (deltaPx, { smooth = false } = {}) => {
      if (smooth) {
        animateTo(panBy(destination(), deltaPx), { duration: DURATION.base });
        return;
      }
      stopTransition();
      set((state) => ({ viewport: panBy(state.viewport, deltaPx) }));
    },
    centerOn: (day) => {
      animateTo(centerOn(destination(), day));
    },
    fitRange: (from, to) => {
      animateTo(fitRange(destination(), from, to));
    },
    goToToday: () => {
      animateTo(centerOn(destination(), getTodayDay()));
    },
  };
});

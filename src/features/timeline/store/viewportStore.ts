import { create } from 'zustand';

import type { DayNumber, Viewport } from '@/types/timeline';

import { centerOn, fitRange, panBy, resizeViewport, zoomAt, zoomTo } from '../lib/scale';
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

export interface ViewportState {
  viewport: Viewport;
  /** Updates the measured width, keeping the left edge in place. */
  setWidth: (widthPx: number) => void;
  setViewport: (viewport: Viewport) => void;
  /** Multiplies the zoom by `factor`, keeping the day under `anchorX` fixed. */
  zoomAt: (anchorX: number, factor: number) => void;
  /** Sets an absolute zoom level, anchored on the center by default. */
  zoomTo: (pxPerDay: number, anchorX?: number) => void;
  /** Positive values move forward in time. */
  panBy: (deltaPx: number) => void;
  centerOn: (day: DayNumber) => void;
  fitRange: (from: DayNumber, to: DayNumber) => void;
  goToToday: () => void;
}

/**
 * Timeline viewport (what is visible and at which zoom).
 * All the math lives in `lib/scale`; the store only holds state and wires actions.
 */
export const useViewportStore = create<ViewportState>()((set) => ({
  viewport: createInitialViewport(),

  setWidth: (widthPx) => {
    set((state) =>
      state.viewport.widthPx === widthPx
        ? state
        : { viewport: resizeViewport(state.viewport, widthPx) },
    );
  },
  setViewport: (viewport) => {
    set({ viewport });
  },
  zoomAt: (anchorX, factor) => {
    set((state) => ({ viewport: zoomAt(state.viewport, anchorX, factor) }));
  },
  zoomTo: (pxPerDay, anchorX) => {
    set((state) => ({ viewport: zoomTo(state.viewport, pxPerDay, anchorX) }));
  },
  panBy: (deltaPx) => {
    set((state) => ({ viewport: panBy(state.viewport, deltaPx) }));
  },
  centerOn: (day) => {
    set((state) => ({ viewport: centerOn(state.viewport, day) }));
  },
  fitRange: (from, to) => {
    set((state) => ({ viewport: fitRange(state.viewport, from, to) }));
  },
  goToToday: () => {
    set((state) => ({ viewport: centerOn(state.viewport, getTodayDay()) }));
  },
}));

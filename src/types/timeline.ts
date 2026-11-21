import type { UUID } from './project';

/**
 * Fractional days since 1970-01-01 (calendar based, timezone independent).
 * The unit of every timeline calculation (see ADR-002 in docs/architecture.md).
 */
export type DayNumber = number;

export interface Viewport {
  /** Day at the left edge of the visible area. */
  startDay: DayNumber;
  /** Continuous zoom level. */
  pxPerDay: number;
  /** Usable width of the timeline area, in pixels. */
  widthPx: number;
}

/** Roughly decades (min) to hours (max). */
export const ZOOM_LIMITS = { min: 0.02, max: 160 } as const;

export const TICK_UNITS = ['year', 'half', 'quarter', 'month', 'week', 'day'] as const;
export type TickUnit = (typeof TICK_UNITS)[number];

/** Zoom band → units shown on the two-level ruler. */
export interface Granularity {
  /** Top row, e.g. "2027". */
  major: TickUnit;
  /** Bottom row, e.g. "T1 T2 T3 T4". */
  minor: TickUnit;
  /** Lowest zoom level (inclusive) where this band applies. */
  minPxPerDay: number;
}

export interface Tick {
  day: DayNumber;
  /** Start of the cell, in px relative to the viewport. */
  x: number;
  /** End of the cell (start of the next tick), in px relative to the viewport. */
  endX: number;
  label: string;
  unit: TickUnit;
}

export type ZoomPresetId = 'years' | 'quarters' | 'months' | 'weeks' | 'days';

export interface ZoomPreset {
  id: ZoomPresetId;
  label: string;
  pxPerDay: number;
}

/** A project bar already positioned and ready to render. */
export interface ProjectBarLayout {
  projectId: UUID;
  x: number;
  /** Never smaller than the minimum clickable width. */
  width: number;
  /** Row index inside the horizon lane. */
  row: number;
  milestoneXs: number[];
}

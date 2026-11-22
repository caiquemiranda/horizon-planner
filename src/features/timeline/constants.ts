/**
 * Pixel metrics used by the timeline layout math.
 * Keep in sync with the layout variables in `src/styles/globals.css` (1rem = 16px).
 */
export const TIMELINE_METRICS = {
  /** `--ruler-height` */
  rulerHeight: 56,
  /** Top row of the ruler (major ticks). */
  rulerMajorHeight: 24,
  /** `--lane-header-height` */
  laneHeaderHeight: 32,
  /** `--row-height` */
  rowHeight: 40,
  /** `--sidebar-width` */
  sidebarWidth: 240,
} as const;

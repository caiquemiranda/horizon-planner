import { type Horizon, HORIZONS, type Project, type UUID } from '@/types/project';
import type { DayNumber, ProjectBarLayout, Viewport } from '@/types/timeline';

import { dayToX } from './scale';
import { isoDateToDay, isoRangeToDays } from './time';

/** Minimum bar width so very short projects stay visible and clickable. */
export const MIN_BAR_WIDTH_PX = 4;

export interface LaneLayoutOptions {
  rowHeight: number;
  headerHeight: number;
  /** Horizons whose rows are hidden (only the header is shown). */
  collapsed?: ReadonlySet<Horizon>;
  /** Lanes to show, in display order (default: all of them). */
  horizons?: readonly Horizon[];
}

export interface LaneLayout {
  horizon: Horizon;
  collapsed: boolean;
  /** Projects in display order (empty when collapsed). */
  projectIds: UUID[];
  /** Total number of projects in the lane, including hidden ones. */
  projectCount: number;
  top: number;
  height: number;
}

export interface RowPosition {
  horizon: Horizon;
  row: number;
  /** Top of the row, in px from the top of the timeline body. */
  top: number;
}

export interface LanesLayout {
  lanes: LaneLayout[];
  rows: Map<UUID, RowPosition>;
  totalHeight: number;
}

/** Display order inside a lane: manual order, then start date, then title. */
export function compareProjects(a: Project, b: Project): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.startDate.localeCompare(b.startDate) ||
    a.title.localeCompare(b.title, 'pt-BR')
  );
}

/**
 * Stacks the Short, Medium and Long-term lanes vertically, one project per row.
 * Every requested lane is present, even empty, so the UI can show empty states.
 */
export function layoutLanes(projects: readonly Project[], options: LaneLayoutOptions): LanesLayout {
  const { rowHeight, headerHeight, collapsed = new Set<Horizon>(), horizons = HORIZONS } = options;
  const rows = new Map<UUID, RowPosition>();
  const lanes: LaneLayout[] = [];
  let top = 0;

  for (const horizon of horizons) {
    const laneProjects = projects
      .filter((project) => project.horizon === horizon)
      .sort(compareProjects);
    const isCollapsed = collapsed.has(horizon);
    const visibleProjects = isCollapsed ? [] : laneProjects;

    visibleProjects.forEach((project, row) => {
      rows.set(project.id, { horizon, row, top: top + headerHeight + row * rowHeight });
    });

    const height = headerHeight + visibleProjects.length * rowHeight;

    lanes.push({
      horizon,
      collapsed: isCollapsed,
      projectIds: visibleProjects.map((project) => project.id),
      projectCount: laneProjects.length,
      top,
      height,
    });

    top += height;
  }

  return { lanes, rows, totalHeight: top };
}

/** Horizontal geometry of a project bar for the current viewport. */
export function computeBarGeometry(
  project: Project,
  viewport: Viewport,
  minWidthPx = MIN_BAR_WIDTH_PX,
): Pick<ProjectBarLayout, 'x' | 'width' | 'milestoneXs'> {
  const { start, end } = isoRangeToDays(project.startDate, project.endDate);
  const x = dayToX(start, viewport);
  const width = Math.max((end - start) * viewport.pxPerDay, minWidthPx);

  // Milestones sit in the middle of their day.
  const milestoneXs = project.milestones.map((milestone) =>
    dayToX(isoDateToDay(milestone.date) + 0.5, viewport),
  );

  return { x, width, milestoneXs };
}

/** Whether `[start, end)` intersects the viewport, extended by `overscanPx` on both sides. */
export function isRangeVisible(
  start: DayNumber,
  end: DayNumber,
  viewport: Viewport,
  overscanPx = 0,
): boolean {
  const left = dayToX(start, viewport);
  const right = dayToX(end, viewport);
  return right >= -overscanPx && left <= viewport.widthPx + overscanPx;
}

/**
 * Bars for the projects placed in `rows`, skipping those outside the viewport.
 * Projects in collapsed lanes have no row and are skipped too.
 */
export function computeBarLayouts(
  projects: readonly Project[],
  rows: ReadonlyMap<UUID, RowPosition>,
  viewport: Viewport,
  { overscanPx = 200 }: { overscanPx?: number } = {},
): ProjectBarLayout[] {
  const layouts: ProjectBarLayout[] = [];

  for (const project of projects) {
    const position = rows.get(project.id);
    if (!position) continue;

    const { start, end } = isoRangeToDays(project.startDate, project.endDate);
    if (!isRangeVisible(start, end, viewport, overscanPx)) continue;

    layouts.push({
      projectId: project.id,
      row: position.row,
      ...computeBarGeometry(project, viewport),
    });
  }

  return layouts;
}

/** Earliest start and latest end across projects, for "fit all" zooming. */
export function getProjectsExtent(
  projects: readonly Project[],
): { start: DayNumber; end: DayNumber } | null {
  if (projects.length === 0) return null;

  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (const project of projects) {
    const range = isoRangeToDays(project.startDate, project.endDate);
    start = Math.min(start, range.start);
    end = Math.max(end, range.end);
  }

  return { start, end };
}

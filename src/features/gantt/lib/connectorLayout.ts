import type { TreeRow } from '@/features/schedule/lib/tree';
import type { UUID } from '@/types/project';
import type { ScheduleResult, TaskDependency } from '@/types/schedule';
import type { Viewport } from '@/types/timeline';

import {
  type Anchor,
  arrowheadPoints,
  CONNECTOR_DEFAULTS,
  getAnchors,
  routeConnector,
  toSvgPath,
} from './connectors';
import { getBarGeometry } from './geometry';

export interface ConnectorShape {
  dependency: TaskDependency;
  path: string;
  arrow: string;
  target: Anchor;
  /** The successor is placed against this link (manual task reporting a violation). */
  violated: boolean;
}

/**
 * Connectors to draw for the current rows and viewport.
 *
 * Visibility policy (spec 6.5, option 1): a link is drawn only when both of its tasks are
 * on visible rows. When a collapsed summary or a filter hides an end, the link is not
 * drawn at all (never towards a stale position) and stays stored; expanding brings it
 * back. Links on summary tasks are ignored by the engine and not drawn either.
 * Links whose both ends are far outside the visible time range are skipped.
 */
export function layoutConnectors(
  dependencies: readonly TaskDependency[],
  rows: readonly TreeRow[],
  result: ScheduleResult,
  viewport: Viewport,
  rowHeight: number,
  /** Rendered rows; links entirely above or below them are skipped. */
  rowRange: { first: number; last: number } = { first: 0, last: Number.POSITIVE_INFINITY },
  margin = 400,
): ConnectorShape[] {
  const rowIndex = new Map<UUID, number>(rows.map((row, index) => [row.task.id, index]));
  const shapes: ConnectorShape[] = [];

  for (const dependency of dependencies) {
    const predecessorRow = rowIndex.get(dependency.predecessorId);
    const successorRow = rowIndex.get(dependency.successorId);
    if (predecessorRow === undefined || successorRow === undefined) continue;
    // Entirely above or below the rendered rows: it cannot cross the visible area.
    if (Math.max(predecessorRow, successorRow) < rowRange.first) continue;
    if (Math.min(predecessorRow, successorRow) > rowRange.last) continue;

    const predecessor = result.tasks.get(dependency.predecessorId);
    const successor = result.tasks.get(dependency.successorId);
    if (!predecessor || !successor) continue;
    if (predecessor.kind === 'summary' || successor.kind === 'summary') continue;

    const from = getBarGeometry(predecessor, predecessorRow, viewport, rowHeight);
    const to = getBarGeometry(successor, successorRow, viewport, rowHeight);
    const { source, target } = getAnchors(dependency.type, from, to);
    const left = Math.min(source.x, target.x);
    const right = Math.max(source.x, target.x);
    if (right < -margin || left > viewport.widthPx + margin) continue;

    const points = routeConnector(source, target, { gap: CONNECTOR_DEFAULTS.gap, rowHeight });
    shapes.push({
      dependency,
      path: toSvgPath(points),
      arrow: arrowheadPoints(target),
      target,
      violated: successor.issues.some(
        (issue) => issue.code === 'dependency-violated' && issue.dependencyId === dependency.id,
      ),
    });
  }
  return shapes;
}

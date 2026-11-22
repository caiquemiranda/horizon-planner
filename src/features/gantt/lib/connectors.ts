import type { DependencyType } from '@/types/schedule';

import type { BarGeometry } from './geometry';

/**
 * Orthogonal (elbow / Manhattan) routing of dependency connectors.
 *
 * A connector leaves the predecessor's anchor, runs only horizontally and vertically
 * with 90° corners, and enters the successor's anchor with an arrowhead pointing from
 * predecessor to successor. Pure geometry: it never changes dates, and the same input
 * always gives the same path (deterministic, no layout-dependent heuristics).
 *
 * Anchors by link type:
 *   FS: predecessor finish (right edge) → successor start (left edge)
 *   SS: predecessor start  (left edge)  → successor start (left edge)
 *   FF: predecessor finish (right edge) → successor finish (right edge)
 *   SF: predecessor start  (left edge)  → successor finish (right edge)
 */

export interface Point {
  x: number;
  y: number;
}

/** +1: the line leaves/enters going right; -1: going left. */
export type Direction = 1 | -1;

export interface Anchor extends Point {
  direction: Direction;
}

export interface RouteOptions {
  /** Horizontal stub before the first and after the last corner. */
  gap: number;
  rowHeight: number;
}

export const CONNECTOR_DEFAULTS = { gap: 10, arrowLength: 6, arrowHalfWidth: 4 } as const;

/** Where a bar is joined: its start or finish edge (milestones: the diamond's sides). */
function edgeX(bar: BarGeometry, edge: 'start' | 'finish'): number {
  if (bar.kind === 'milestone') {
    return edge === 'start' ? bar.x - bar.height / 2 : bar.x + bar.height / 2;
  }
  return edge === 'start' ? bar.x : bar.x + bar.width;
}

export function getAnchors(
  type: DependencyType,
  predecessor: BarGeometry,
  successor: BarGeometry,
): { source: Anchor; target: Anchor } {
  const fromFinish = type === 'FS' || type === 'FF';
  const toStart = type === 'FS' || type === 'SS';
  return {
    source: {
      x: edgeX(predecessor, fromFinish ? 'finish' : 'start'),
      y: predecessor.centerY,
      // Leave away from the bar: rightwards from a finish, leftwards from a start.
      direction: fromFinish ? 1 : -1,
    },
    target: {
      x: edgeX(successor, toStart ? 'start' : 'finish'),
      y: successor.centerY,
      // Enter towards the bar: rightwards into a start, leftwards into a finish.
      direction: toStart ? 1 : -1,
    },
  };
}

/** Drops repeated points and middle points of straight runs. */
function simplify(points: Point[]): Point[] {
  const unique = points.filter(
    (point, index) =>
      index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y,
  );
  return unique.filter((point, index) => {
    const before = unique[index - 1];
    const after = unique[index + 1];
    if (!before || !after) return true;
    const sameX = before.x === point.x && point.x === after.x;
    const sameY = before.y === point.y && point.y === after.y;
    return !sameX && !sameY;
  });
}

/**
 * Orthogonal polyline from `source` to `target`.
 *
 * - When the vertical run can sit between the two stubs (the usual "staircase"), the path
 *   is: out of the source, down/up to the target row, into the target (one or two corners).
 * - Otherwise (the successor starts before the predecessor ends, e.g. a lead), the path
 *   steps out of the source, runs along the boundary between the two rows, and comes back
 *   into the target from the correct side, so the arrow never enters backwards.
 */
export function routeConnector(source: Anchor, target: Anchor, options: RouteOptions): Point[] {
  const { gap, rowHeight } = options;
  const start: Point = { x: source.x, y: source.y };
  const end: Point = { x: target.x, y: target.y };
  const exitX = source.x + source.direction * gap;
  const approachX = target.x - target.direction * gap;

  let points: Point[];
  if (source.direction !== target.direction) {
    // SS (left, right) or FF (right, left): a single vertical run outside both stubs.
    const x = source.direction < 0 ? Math.min(exitX, approachX) : Math.max(exitX, approachX);
    points = [start, { x, y: source.y }, { x, y: target.y }, end];
  } else if ((approachX - exitX) * source.direction >= 0) {
    // FS / SF with room in between: vertical run right after the source stub.
    points = [start, { x: exitX, y: source.y }, { x: exitX, y: target.y }, end];
  } else {
    // Overlap: detour along the row boundary nearest the source, towards the target.
    const down = target.y >= source.y;
    const boundaryY = source.y + (down ? rowHeight / 2 : -rowHeight / 2);
    points = [
      start,
      { x: exitX, y: source.y },
      { x: exitX, y: boundaryY },
      { x: approachX, y: boundaryY },
      { x: approachX, y: target.y },
      end,
    ];
  }
  return simplify(points);
}

export function toSvgPath(points: readonly Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${String(point.x)} ${String(point.y)}`)
    .join(' ');
}

/** Triangle with its tip on the target anchor, pointing in the entry direction. */
export function arrowheadPoints(target: Anchor): string {
  const { arrowLength, arrowHalfWidth } = CONNECTOR_DEFAULTS;
  const baseX = target.x - target.direction * arrowLength;
  return [
    `${String(target.x)},${String(target.y)}`,
    `${String(baseX)},${String(target.y - arrowHalfWidth)}`,
    `${String(baseX)},${String(target.y + arrowHalfWidth)}`,
  ].join(' ');
}

/** True when every segment is horizontal or vertical (no diagonals). */
export function isOrthogonal(points: readonly Point[]): boolean {
  return points.every((point, index) => {
    const next = points[index + 1];
    return !next || next.x === point.x || next.y === point.y;
  });
}

/**
 * Link created by dragging from one bar edge to another: from a finish to a start is
 * finish-to-start, start to start is start-to-start, and so on.
 */
export function linkTypeFor(
  fromEdge: 'start' | 'finish',
  toEdge: 'start' | 'finish',
): DependencyType {
  if (fromEdge === 'finish') return toEdge === 'start' ? 'FS' : 'FF';
  return toEdge === 'start' ? 'SS' : 'SF';
}

import { describe, expect, it } from 'vitest';

import type { DependencyType } from '@/types/schedule';

import {
  arrowheadPoints,
  getAnchors,
  isOrthogonal,
  linkTypeFor,
  type Point,
  routeConnector,
  toSvgPath,
} from '../connectors';
import type { BarGeometry } from '../geometry';

const ROW = 36;
const options = { gap: 10, rowHeight: ROW };

function bar(
  rowIndex: number,
  x: number,
  width: number,
  kind: BarGeometry['kind'] = 'task',
): BarGeometry {
  const centerY = rowIndex * ROW + ROW / 2;
  return kind === 'milestone'
    ? {
        id: `r${String(rowIndex)}`,
        kind,
        rowIndex,
        x,
        width: 0,
        centerY,
        top: centerY - 7,
        height: 14,
      }
    : {
        id: `r${String(rowIndex)}`,
        kind,
        rowIndex,
        x,
        width,
        centerY,
        top: centerY - 10,
        height: 20,
      };
}

function route(type: DependencyType, predecessor: BarGeometry, successor: BarGeometry) {
  const { source, target } = getAnchors(type, predecessor, successor);
  return { source, target, points: routeConnector(source, target, options) };
}

const last = (points: Point[]) => points[points.length - 1];
const beforeLast = (points: Point[]) => points[points.length - 2];

describe('getAnchors', () => {
  const pred = bar(0, 100, 50);
  const succ = bar(2, 200, 40);

  it.each([
    ['FS', 150, 1, 200, 1],
    ['SS', 100, -1, 200, 1],
    ['FF', 150, 1, 240, -1],
    ['SF', 100, -1, 240, -1],
  ] as const)('%s joins the right edges', (type, sourceX, sourceDir, targetX, targetDir) => {
    const { source, target } = getAnchors(type, pred, succ);
    expect(source).toEqual({ x: sourceX, y: 18, direction: sourceDir });
    expect(target).toEqual({ x: targetX, y: 2 * ROW + 18, direction: targetDir });
  });

  it('joins milestones on the sides of the diamond', () => {
    const { source } = getAnchors('FS', bar(0, 100, 0, 'milestone'), succ);
    expect(source.x).toBe(107);
  });
});

describe('routeConnector', () => {
  it('draws the classic staircase for FS going down (one corner pair)', () => {
    const { points } = route('FS', bar(0, 100, 50), bar(1, 200, 40));
    expect(points).toEqual([
      { x: 150, y: 18 },
      { x: 160, y: 18 },
      { x: 160, y: 54 },
      { x: 200, y: 54 },
    ]);
  });

  it('works upwards too, when the successor row is above', () => {
    const { points } = route('FS', bar(3, 100, 50), bar(1, 200, 40));
    expect(points[2]).toEqual({ x: 160, y: 54 });
    expect(isOrthogonal(points)).toBe(true);
  });

  it('detours along the row boundary when the successor starts before the predecessor ends', () => {
    // Lead: successor starts at 120, inside the predecessor (100–150).
    const { points } = route('FS', bar(0, 100, 50), bar(2, 120, 40));
    expect(points).toEqual([
      { x: 150, y: 18 },
      { x: 160, y: 18 },
      { x: 160, y: 36 },
      { x: 110, y: 36 },
      { x: 110, y: 90 },
      { x: 120, y: 90 },
    ]);
    // Enters the successor from its left, pointing right.
    expect(beforeLast(points)?.x).toBeLessThan(last(points)?.x ?? 0);
  });

  it('routes SS outside both starts, entering from the left', () => {
    const { points } = route('SS', bar(0, 100, 50), bar(1, 80, 40));
    expect(points).toEqual([
      { x: 100, y: 18 },
      { x: 70, y: 18 },
      { x: 70, y: 54 },
      { x: 80, y: 54 },
    ]);
  });

  it('routes FF outside both finishes, entering from the right', () => {
    const { points } = route('FF', bar(0, 100, 50), bar(1, 120, 80));
    expect(points).toEqual([
      { x: 150, y: 18 },
      { x: 210, y: 18 },
      { x: 210, y: 54 },
      { x: 200, y: 54 },
    ]);
  });

  it('routes SF from the start to the finish, entering from the right', () => {
    const forward = route('SF', bar(0, 100, 50), bar(1, 40, 40));
    expect(forward.points).toEqual([
      { x: 100, y: 18 },
      { x: 90, y: 18 },
      { x: 90, y: 54 },
      { x: 80, y: 54 },
    ]);
    // Successor finishing after the predecessor starts: detour, still entering leftwards.
    const backward = route('SF', bar(0, 100, 50), bar(2, 60, 80));
    expect(beforeLast(backward.points)?.x).toBeGreaterThan(last(backward.points)?.x ?? 0);
  });

  it('never produces diagonal segments, for every type and position', () => {
    const types: DependencyType[] = ['FS', 'SS', 'FF', 'SF'];
    for (const type of types) {
      for (const [predRow, succRow] of [
        [0, 1],
        [1, 0],
        [0, 5],
      ] as const) {
        for (const succX of [0, 90, 120, 155, 400]) {
          const { points, target } = route(type, bar(predRow, 100, 50), bar(succRow, succX, 30));
          expect(isOrthogonal(points)).toBe(true);
          expect(last(points)).toEqual({ x: target.x, y: target.y });
          // The last segment always enters the target in its entry direction.
          const previous = beforeLast(points);
          expect(Math.sign((last(points)?.x ?? 0) - (previous?.x ?? 0))).toBe(target.direction);
        }
      }
    }
  });
});

describe('SVG output', () => {
  it('writes paths and arrowheads', () => {
    expect(
      toSvgPath([
        { x: 1, y: 2 },
        { x: 3, y: 2 },
      ]),
    ).toBe('M1 2 L3 2');
    expect(arrowheadPoints({ x: 100, y: 50, direction: 1 })).toBe('100,50 94,46 94,54');
    expect(arrowheadPoints({ x: 100, y: 50, direction: -1 })).toBe('100,50 106,46 106,54');
  });
});

describe('linkTypeFor', () => {
  it('maps the dragged and dropped edges to the link type', () => {
    expect(linkTypeFor('finish', 'start')).toBe('FS');
    expect(linkTypeFor('start', 'start')).toBe('SS');
    expect(linkTypeFor('finish', 'finish')).toBe('FF');
    expect(linkTypeFor('start', 'finish')).toBe('SF');
  });
});

import { describe, expect, it } from 'vitest';

import type { Horizon, ISODate, Project } from '@/types/project';
import type { Viewport } from '@/types/timeline';

import {
  computeBarGeometry,
  computeBarLayouts,
  getProjectsExtent,
  isRangeVisible,
  layoutLanes,
  MIN_BAR_WIDTH_PX,
} from '../layout';
import { isoDateToDay } from '../time';

const dayOf = (value: string) => isoDateToDay(value as ISODate);

let counter = 0;

function makeProject(overrides: Partial<Project> = {}): Project {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    title: `Projeto ${counter}`,
    description: '',
    horizon: 'short',
    category: null,
    status: 'planned',
    color: 'blue',
    startDate: '2026-01-01' as ISODate,
    endDate: '2026-01-10' as ISODate,
    progress: 0,
    milestones: [],
    lifecycle: {
      startedAt: null,
      completedAt: null,
      closedAt: null,
      closeReason: null,
      postponement: null,
      history: [],
    },
    hiddenAt: null,
    deletedAt: null,
    demo: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const options = { rowHeight: 40, headerHeight: 32 };

describe('layoutLanes', () => {
  it('always returns the three horizon lanes in order', () => {
    const { lanes, totalHeight } = layoutLanes([], options);

    expect(lanes.map((lane) => lane.horizon)).toEqual(['short', 'medium', 'long']);
    expect(totalHeight).toBe(3 * 32);
  });

  it('stacks lanes and rows vertically', () => {
    const a = makeProject({ horizon: 'short', sortOrder: 1 });
    const b = makeProject({ horizon: 'short', sortOrder: 0 });
    const c = makeProject({ horizon: 'long' });

    const { lanes, rows, totalHeight } = layoutLanes([a, b, c], options);

    expect(lanes.map((lane) => [lane.top, lane.height])).toEqual([
      [0, 32 + 2 * 40],
      [112, 32],
      [144, 32 + 40],
    ]);
    expect(lanes[0]?.projectIds).toEqual([b.id, a.id]);
    expect(rows.get(b.id)).toEqual({ horizon: 'short', row: 0, top: 32 });
    expect(rows.get(a.id)).toEqual({ horizon: 'short', row: 1, top: 72 });
    expect(rows.get(c.id)).toEqual({ horizon: 'long', row: 0, top: 176 });
    expect(totalHeight).toBe(216);
  });

  it('breaks sort ties by start date, then title', () => {
    const late = makeProject({
      startDate: '2026-02-01' as ISODate,
      endDate: '2026-02-02' as ISODate,
    });
    const beta = makeProject({ title: 'Beta' });
    const alpha = makeProject({ title: 'Alfa' });

    const { lanes } = layoutLanes([late, beta, alpha], options);

    expect(lanes[0]?.projectIds).toEqual([alpha.id, beta.id, late.id]);
  });

  it('hides the rows of collapsed lanes but keeps their count', () => {
    const projects = [makeProject({ horizon: 'medium' }), makeProject({ horizon: 'medium' })];
    const collapsed = new Set<Horizon>(['medium']);

    const { lanes, rows } = layoutLanes(projects, { ...options, collapsed });

    expect(lanes[1]).toMatchObject({
      collapsed: true,
      projectIds: [],
      projectCount: 2,
      height: 32,
    });
    expect(rows.size).toBe(0);
  });

  it('lays out only the requested lanes', () => {
    const short = makeProject({ horizon: 'short' });
    const long = makeProject({ horizon: 'long' });

    const { lanes, rows } = layoutLanes([short, long], { ...options, horizons: ['long'] });

    expect(lanes.map((lane) => [lane.horizon, lane.top])).toEqual([['long', 0]]);
    expect(rows.get(long.id)).toEqual({ horizon: 'long', row: 0, top: 32 });
    expect(rows.has(short.id)).toBe(false);
  });
});

describe('computeBarGeometry', () => {
  const viewport: Viewport = { startDay: dayOf('2026-01-01'), pxPerDay: 10, widthPx: 1000 };

  it('covers the end date inclusively', () => {
    const geometry = computeBarGeometry(makeProject(), viewport);
    expect(geometry).toMatchObject({ x: 0, width: 100 });
  });

  it('enforces a minimum clickable width', () => {
    const zoomedOut = { ...viewport, pxPerDay: 0.02 };
    const project = makeProject({ endDate: '2026-01-01' as ISODate });

    expect(computeBarGeometry(project, zoomedOut).width).toBe(MIN_BAR_WIDTH_PX);
  });

  it('places milestones in the middle of their day', () => {
    const project = makeProject({
      milestones: [
        {
          id: '00000000-0000-4000-8000-000000000999',
          title: 'Marco',
          date: '2026-01-05' as ISODate,
          completed: false,
        },
      ],
    });

    expect(computeBarGeometry(project, viewport).milestoneXs).toEqual([45]);
  });
});

describe('visibility', () => {
  const viewport: Viewport = { startDay: 100, pxPerDay: 10, widthPx: 500 };

  it.each([
    [90, 99, false],
    [90, 100, true],
    [120, 130, true],
    [150, 160, true],
    [151, 160, false],
  ])('range [%s, %s) visible: %s', (start, end, expected) => {
    expect(isRangeVisible(start, end, viewport)).toBe(expected);
  });

  it('extends the check by the overscan', () => {
    expect(isRangeVisible(151, 160, viewport, 10)).toBe(true);
  });
});

describe('computeBarLayouts', () => {
  it('returns bars only for visible projects that have a row', () => {
    const visible = makeProject();
    const offscreen = makeProject({
      startDate: '2030-01-01' as ISODate,
      endDate: '2030-02-01' as ISODate,
    });
    const collapsed = makeProject({ horizon: 'long' });
    const projects = [visible, offscreen, collapsed];

    const { rows } = layoutLanes(projects, { ...options, collapsed: new Set<Horizon>(['long']) });
    const viewport: Viewport = { startDay: dayOf('2026-01-01'), pxPerDay: 10, widthPx: 1000 };

    const bars = computeBarLayouts(projects, rows, viewport);

    expect(bars).toEqual([{ projectId: visible.id, row: 0, x: 0, width: 100, milestoneXs: [] }]);
  });
});

describe('getProjectsExtent', () => {
  it('returns null without projects', () => {
    expect(getProjectsExtent([])).toBeNull();
  });

  it('spans from the earliest start to the latest (exclusive) end', () => {
    const extent = getProjectsExtent([
      makeProject({ startDate: '2026-03-01' as ISODate, endDate: '2026-04-01' as ISODate }),
      makeProject({ startDate: '2026-01-15' as ISODate, endDate: '2026-02-01' as ISODate }),
    ]);

    expect(extent).toEqual({ start: dayOf('2026-01-15'), end: dayOf('2026-04-01') + 1 });
  });
});

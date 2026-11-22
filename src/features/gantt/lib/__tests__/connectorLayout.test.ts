import { describe, expect, it } from 'vitest';

import { DEFAULT_CALENDAR } from '@/features/schedule/lib/calendar';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { buildTreeIndex, flattenVisibleRows } from '@/features/schedule/lib/tree';
import { isoDateToDay } from '@/features/timeline/lib/time';
import { buildOutline, makeLink, taskId } from '@/test/schedule';
import type { ISODate } from '@/types/project';
import type { ScheduleTask, TaskDependency } from '@/types/schedule';
import type { Viewport } from '@/types/timeline';

import { layoutConnectors } from '../connectorLayout';

const MONDAY = '2026-11-23' as ISODate;
const viewport: Viewport = { startDay: isoDateToDay(MONDAY) - 2, pxPerDay: 20, widthPx: 1000 };

const tasks = (): ScheduleTask[] =>
  buildOutline([
    {
      key: 'Phase',
      children: [
        { key: 'A', task: { start: MONDAY, duration: 2 } },
        { key: 'B', task: { start: MONDAY, duration: 3 } },
      ],
    },
    { key: 'C', task: { start: MONDAY, duration: 1 } },
    { key: 'D', task: { start: MONDAY, duration: 1, mode: 'manual' } },
  ]);

function layout(links: TaskDependency[], collapsed: string[] = [], list = tasks()) {
  const index = buildTreeIndex(list);
  const summaryIds = list
    .filter((task) => list.some((child) => child.parentId === task.id))
    .map((t) => t.id);
  const rows = flattenVisibleRows(index, {
    expandedIds: new Set(summaryIds.filter((id) => !collapsed.includes(id))),
  });
  const result = computeSchedule({ tasks: list, dependencies: links, calendar: DEFAULT_CALENDAR });
  return layoutConnectors(links, rows, result, viewport, 36);
}

describe('layoutConnectors', () => {
  it('draws nothing without links, even for consecutive or nested tasks', () => {
    expect(layout([])).toEqual([]);
  });

  it('draws one orthogonal connector per stored link', () => {
    const shapes = layout([makeLink('A', 'B'), makeLink('B', 'C')]);
    expect(shapes.map((shape) => shape.dependency.id)).toEqual([
      makeLink('A', 'B').id,
      makeLink('B', 'C').id,
    ]);
    expect(shapes[0]?.path).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+$/);
  });

  it('hides links with an end inside a collapsed summary, without losing them', () => {
    const links = [makeLink('A', 'C'), makeLink('C', 'D')];
    expect(layout(links, [taskId('Phase')]).map((shape) => shape.dependency.id)).toEqual([
      makeLink('C', 'D').id,
    ]);
    expect(layout(links)).toHaveLength(2);
  });

  it('flags links that a manual task does not respect', () => {
    const [shape] = layout([makeLink('C', 'D')]);
    expect(shape?.violated).toBe(true);
    expect(layout([makeLink('A', 'B')])[0]?.violated).toBe(false);
  });

  it('skips links on summary tasks and links far outside the view', () => {
    expect(layout([makeLink('Phase', 'C')])).toEqual([]);
    const far = tasks().map((task) =>
      task.id === taskId('C') || task.id === taskId('D')
        ? { ...task, start: '2028-01-03' as ISODate }
        : task,
    );
    expect(layout([makeLink('C', 'D')], [], far)).toEqual([]);
  });

  it('follows the dates: moving the predecessor moves the connector', () => {
    const before = layout([makeLink('A', 'C')])[0]?.path;
    const longer = tasks().map((task) =>
      task.id === taskId('A') ? { ...task, duration: 4 } : task,
    );
    expect(layout([makeLink('A', 'C')], [], longer)[0]?.path).not.toBe(before);
  });
});

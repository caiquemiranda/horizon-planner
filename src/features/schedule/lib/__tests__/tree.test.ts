import { describe, expect, it } from 'vitest';

import { buildOutline, makeTask, taskId } from '@/test/schedule';
import type { ScheduleTask } from '@/types/schedule';

import { ScheduleRuleError } from '../errors';
import {
  buildTreeIndex,
  copyTaskTree,
  countPendingLeafTasks,
  findHierarchyProblems,
  flattenVisibleRows,
  getDescendantIds,
  getWbsNumbers,
  indentTask,
  insertTask,
  moveTask,
  outdentTask,
  removeTaskTree,
  shiftTask,
} from '../tree';

/**
 * 1 Engenharia
 *   1.1 A
 *   1.2 B
 *     1.2.1 B1
 *       1.2.1.1 B1a
 * 2 Entrega
 */
const outline = () =>
  buildOutline([
    {
      key: 'Eng',
      children: [{ key: 'A' }, { key: 'B', children: [{ key: 'B1', children: [{ key: 'B1a' }] }] }],
    },
    { key: 'Entrega' },
  ]);

const wbsOf = (tasks: ScheduleTask[]) => {
  const numbers = getWbsNumbers(buildTreeIndex(tasks));
  return Object.fromEntries(
    tasks.map((task) => [task.id.replace('task-', ''), numbers.get(task.id)]),
  );
};

const allExpanded = (tasks: ScheduleTask[]) => new Set(tasks.map((task) => task.id));

function expectContiguousOrders(tasks: ScheduleTask[]) {
  const groups = new Map<string | null, number[]>();
  for (const task of tasks) {
    groups.set(task.parentId, [...(groups.get(task.parentId) ?? []), task.order]);
  }
  for (const orders of groups.values()) {
    expect([...orders].sort((a, b) => a - b)).toEqual(orders.map((_, index) => index));
  }
}

describe('WBS numbers', () => {
  it('derives numbers from the hierarchy and sibling order, at any depth', () => {
    expect(wbsOf(outline())).toEqual({
      Eng: '1',
      A: '1.1',
      B: '1.2',
      B1: '1.2.1',
      B1a: '1.2.1.1',
      Entrega: '2',
    });
  });

  it('renumbers after reordering, keeping ids', () => {
    const tasks = shiftTask(outline(), taskId('B'), -1);
    expect(wbsOf(tasks)).toMatchObject({ B: '1.1', A: '1.2', B1: '1.1.1' });
    expect(tasks.map((task) => task.id).sort()).toEqual(
      outline()
        .map((task) => task.id)
        .sort(),
    );
  });
});

describe('flattenVisibleRows', () => {
  it('lists rows depth first with their depth', () => {
    const tasks = outline();
    const rows = flattenVisibleRows(buildTreeIndex(tasks), { expandedIds: allExpanded(tasks) });
    expect(rows.map((row) => [row.wbs, row.depth])).toEqual([
      ['1', 0],
      ['1.1', 1],
      ['1.2', 1],
      ['1.2.1', 2],
      ['1.2.1.1', 3],
      ['2', 0],
    ]);
  });

  it('hides descendants of collapsed tasks and shows them again on expand', () => {
    const tasks = outline();
    const index = buildTreeIndex(tasks);
    const expanded = allExpanded(tasks);
    expanded.delete(taskId('B'));

    const collapsed = flattenVisibleRows(index, { expandedIds: expanded });
    expect(collapsed.map((row) => row.wbs)).toEqual(['1', '1.1', '1.2', '2']);
    expect(collapsed[2]).toMatchObject({ hasChildren: true, expanded: false });

    expanded.add(taskId('B'));
    expect(flattenVisibleRows(index, { expandedIds: expanded })).toHaveLength(6);
  });

  it('keeps ancestors of filter matches as context', () => {
    const tasks = outline();
    const rows = flattenVisibleRows(buildTreeIndex(tasks), {
      expandedIds: new Set(),
      matches: (task) => task.name === 'B1a',
    });
    expect(rows.map((row) => [row.wbs, row.isFilterContext])).toEqual([
      ['1', true],
      ['1.2', true],
      ['1.2.1', true],
      ['1.2.1.1', false],
    ]);
  });
});

describe('hierarchy mutations', () => {
  it('inserts a task at a position inside a parent', () => {
    const tasks = insertTask(outline(), makeTask({ id: taskId('New') }), taskId('Eng'), 1);
    expect(wbsOf(tasks)).toMatchObject({ A: '1.1', New: '1.2', B: '1.3' });
    expectContiguousOrders(tasks);
  });

  it('indents a task under the sibling above it', () => {
    const tasks = indentTask(outline(), taskId('B'));
    expect(wbsOf(tasks)).toMatchObject({ A: '1.1', B: '1.1.1', B1: '1.1.1.1' });
    expectContiguousOrders(tasks);
  });

  it('refuses to indent the first task of a group', () => {
    expect(() => indentTask(outline(), taskId('A'))).toThrow(ScheduleRuleError);
  });

  it('outdents a task right after its former parent, with its descendants', () => {
    const tasks = outdentTask(outline(), taskId('B'));
    expect(wbsOf(tasks)).toMatchObject({ Eng: '1', A: '1.1', B: '2', B1: '2.1', Entrega: '3' });
    expectContiguousOrders(tasks);
  });

  it('refuses to outdent a root task', () => {
    expect(() => outdentTask(outline(), taskId('Eng'))).toThrow(/primeiro nível/);
  });

  it('moves a task with its subtree to another parent', () => {
    const tasks = moveTask(outline(), taskId('B'), taskId('Entrega'), 0);
    expect(wbsOf(tasks)).toMatchObject({ A: '1.1', Entrega: '2', B: '2.1', B1a: '2.1.1.1' });
    expectContiguousOrders(tasks);
  });

  it('rejects moving a task inside itself or its descendants', () => {
    expect(() => moveTask(outline(), taskId('B'), taskId('B1a'), 0)).toThrow(
      expect.objectContaining({ code: 'hierarchy-cycle' }),
    );
    expect(() => moveTask(outline(), taskId('B'), taskId('B'), 0)).toThrow(ScheduleRuleError);
  });

  it('removes a task with its whole subtree and closes the gap', () => {
    const { tasks, removedIds } = removeTaskTree(outline(), taskId('A'));
    expect(removedIds).toEqual(new Set([taskId('A')]));
    expect(wbsOf(tasks)).toMatchObject({ B: '1.1' });

    const subtree = removeTaskTree(outline(), taskId('B'));
    expect(subtree.removedIds).toEqual(new Set([taskId('B'), taskId('B1'), taskId('B1a')]));
    expectContiguousOrders(subtree.tasks);
  });

  it('copies a subtree right after the original, with new ids', () => {
    let next = 0;
    const { tasks, idMap } = copyTaskTree(outline(), taskId('B'), () => `copy-${String(next++)}`);
    const index = buildTreeIndex(tasks);
    const copyId = idMap.get(taskId('B')) ?? '';

    expect(index.byId.get(copyId)?.name).toBe('B (cópia)');
    expect(getWbsNumbers(index).get(copyId)).toBe('1.3');
    expect(getDescendantIds(index, copyId)).toHaveLength(2);
    expect(tasks).toHaveLength(outline().length + 3);
    expectContiguousOrders(tasks);
  });

  it('never mutates its input', () => {
    const tasks = outline();
    const snapshot = structuredClone(tasks);
    indentTask(tasks, taskId('B'));
    outdentTask(tasks, taskId('B1'));
    removeTaskTree(tasks, taskId('Eng'));
    expect(tasks).toEqual(snapshot);
  });
});

describe('findHierarchyProblems', () => {
  it('accepts a valid hierarchy', () => {
    expect(findHierarchyProblems(outline())).toEqual([]);
  });

  it('detects cycles, missing parents and duplicates', () => {
    const cycle = [
      makeTask({ id: 'a', parentId: 'b' }),
      makeTask({ id: 'b', parentId: 'a' }),
      makeTask({ id: 'c', parentId: 'missing' }),
      makeTask({ id: 'c' }),
    ];
    const problems = findHierarchyProblems(cycle);
    expect(problems.some((problem) => problem.includes('ciclo'))).toBe(true);
    expect(problems.some((problem) => problem.includes('inexistente'))).toBe(true);
    expect(problems.some((problem) => problem.includes('duplicada'))).toBe(true);
  });
});

describe('countPendingLeafTasks', () => {
  it('counts unfinished leaves only, never summaries', () => {
    const tasks = [
      makeTask({ id: 'phase', progress: 0 }),
      makeTask({ id: 'a', parentId: 'phase', progress: 100 }),
      makeTask({ id: 'b', parentId: 'phase', progress: 30 }),
      makeTask({ id: 'm', duration: 0, progress: 0 }),
    ];
    expect(countPendingLeafTasks(tasks)).toBe(2);
    expect(countPendingLeafTasks([])).toBe(0);
  });
});

import type { UUID } from '@/types/project';
import type { ScheduleTask } from '@/types/schedule';

import { ScheduleRuleError } from './errors';

/**
 * The work breakdown structure (WBS) as a tree of tasks.
 *
 * Tasks are stored flat with `parentId` + `order`; everything here derives the tree from
 * that. Functions are pure: they never mutate their input and return new arrays where
 * sibling `order` values are contiguous (0, 1, 2…).
 */

export interface TreeIndex {
  byId: Map<UUID, ScheduleTask>;
  /** Children of each parent (`null` = root), sorted by `order`. */
  children: Map<UUID | null, ScheduleTask[]>;
}

/**
 * @param orphansAsRoots Shows tasks whose parent is missing as root tasks (default), so
 *   broken data still shows every task. Mutations pass `false` to keep groups exact.
 */
export function buildTreeIndex(tasks: readonly ScheduleTask[], orphansAsRoots = true): TreeIndex {
  const byId = new Map<UUID, ScheduleTask>();
  const children = new Map<UUID | null, ScheduleTask[]>();

  for (const task of tasks) byId.set(task.id, task);
  for (const task of tasks) {
    const parentId =
      orphansAsRoots && task.parentId !== null && !byId.has(task.parentId) ? null : task.parentId;
    const siblings = children.get(parentId);
    if (siblings) siblings.push(task);
    else children.set(parentId, [task]);
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  return { byId, children };
}

export function getChildren(index: TreeIndex, parentId: UUID | null): ScheduleTask[] {
  return index.children.get(parentId) ?? [];
}

export function hasChildren(index: TreeIndex, id: UUID): boolean {
  return getChildren(index, id).length > 0;
}

/** Every descendant of `id` (not including it), depth first. */
export function getDescendantIds(index: TreeIndex, id: UUID): UUID[] {
  const result: UUID[] = [];
  const stack = [...getChildren(index, id)].reverse();
  while (stack.length > 0) {
    const task = stack.pop();
    if (!task) break;
    result.push(task.id);
    stack.push(...[...getChildren(index, task.id)].reverse());
  }
  return result;
}

/** Ancestors of `id`, from its parent up to the root. */
export function getAncestorIds(index: TreeIndex, id: UUID): UUID[] {
  const result: UUID[] = [];
  const seen = new Set<UUID>([id]);
  let parentId = index.byId.get(id)?.parentId ?? null;
  while (parentId !== null && index.byId.has(parentId) && !seen.has(parentId)) {
    result.push(parentId);
    seen.add(parentId);
    parentId = index.byId.get(parentId)?.parentId ?? null;
  }
  return result;
}

export function isDescendantOf(index: TreeIndex, id: UUID, ancestorId: UUID): boolean {
  return getAncestorIds(index, id).includes(ancestorId);
}

/** Tasks in WBS order (depth first), whatever their expansion state. */
export function getTasksInWbsOrder(index: TreeIndex): ScheduleTask[] {
  const result: ScheduleTask[] = [];
  const visit = (parentId: UUID | null) => {
    for (const task of getChildren(index, parentId)) {
      result.push(task);
      visit(task.id);
    }
  };
  visit(null);
  return result;
}

/** WBS numbers derived from the hierarchy and sibling order: `1`, `1.2`, `1.2.3`… */
export function getWbsNumbers(index: TreeIndex): Map<UUID, string> {
  const result = new Map<UUID, string>();
  const visit = (parentId: UUID | null, prefix: string) => {
    getChildren(index, parentId).forEach((task, position) => {
      const wbs = prefix === '' ? String(position + 1) : `${prefix}.${String(position + 1)}`;
      result.set(task.id, wbs);
      visit(task.id, wbs);
    });
  };
  visit(null, '');
  return result;
}

export interface TreeRow {
  task: ScheduleTask;
  wbs: string;
  /** 0 for root tasks. */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Shown only because a descendant matches the filter. */
  isFilterContext: boolean;
}

export interface FlattenOptions {
  /** Ids of expanded tasks; collapsed tasks hide all their descendants. */
  expandedIds: ReadonlySet<UUID>;
  /**
   * Optional filter. Matching tasks are shown with their ancestors (marked as context),
   * so the hierarchy stays understandable; descendants of a match are not added.
   */
  matches?: (task: ScheduleTask) => boolean;
}

/**
 * The single list of visible rows shared by the TreeGrid and the Gantt: row `i` of the
 * table and row `i` of the chart are always the same task.
 */
export function flattenVisibleRows(index: TreeIndex, options: FlattenOptions): TreeRow[] {
  const wbs = getWbsNumbers(index);
  const { matches } = options;
  let included: Set<UUID> | null = null;
  let matched: Set<UUID> | null = null;

  if (matches) {
    included = new Set();
    matched = new Set();
    for (const task of index.byId.values()) {
      if (!matches(task)) continue;
      matched.add(task.id);
      included.add(task.id);
      for (const ancestorId of getAncestorIds(index, task.id)) included.add(ancestorId);
    }
  }

  const rows: TreeRow[] = [];
  const visit = (parentId: UUID | null, depth: number) => {
    for (const task of getChildren(index, parentId)) {
      if (included && !included.has(task.id)) continue;
      const children = hasChildren(index, task.id);
      // While filtering, context ancestors are always open so matches are reachable.
      const isContext = matched !== null && !matched.has(task.id);
      const expanded = children && (isContext || options.expandedIds.has(task.id));
      rows.push({
        task,
        wbs: wbs.get(task.id) ?? '',
        depth,
        hasChildren: children,
        expanded,
        isFilterContext: isContext,
      });
      if (expanded) visit(task.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

// ── Mutations ────────────────────────────────────────────────────────────────────────

function requireTask(index: TreeIndex, id: UUID): ScheduleTask {
  const task = index.byId.get(id);
  if (!task) throw new ScheduleRuleError('task-not-found', 'A tarefa não existe mais.');
  return task;
}

/**
 * Rebuilds the array with `id` placed under `parentId` at `position` among its new
 * siblings, and renumbers every sibling group touched.
 */
function placeTask(
  tasks: readonly ScheduleTask[],
  moved: ScheduleTask,
  parentId: UUID | null,
  position: number,
): ScheduleTask[] {
  const others = tasks.filter((task) => task.id !== moved.id);
  // Exact groups: the moved task's children must not be mistaken for root tasks.
  const index = buildTreeIndex(others, false);
  const siblings = [...getChildren(index, parentId)];
  const clamped = Math.max(0, Math.min(position, siblings.length));
  siblings.splice(clamped, 0, { ...moved, parentId });

  const reordered = new Map<UUID, ScheduleTask>();
  siblings.forEach((task, order) => reordered.set(task.id, { ...task, order }));
  // Close the gap left in the previous sibling group.
  if (moved.parentId !== parentId) {
    getChildren(index, moved.parentId).forEach((task, order) => {
      reordered.set(task.id, { ...task, order });
    });
  }

  const result = others.map((task) => reordered.get(task.id) ?? task);
  const placed = reordered.get(moved.id);
  if (placed) result.push(placed);
  return result;
}

/** Inserts a new task under `parentId` at `position` (end of the group by default). */
export function insertTask(
  tasks: readonly ScheduleTask[],
  task: ScheduleTask,
  parentId: UUID | null,
  position = Number.POSITIVE_INFINITY,
): ScheduleTask[] {
  const index = buildTreeIndex(tasks);
  if (parentId !== null) requireTask(index, parentId);
  return placeTask(
    tasks,
    { ...task, parentId, order: Number.POSITIVE_INFINITY },
    parentId,
    position,
  );
}

/** Moves a task (with its descendants) to another parent and/or position. */
export function moveTask(
  tasks: readonly ScheduleTask[],
  id: UUID,
  parentId: UUID | null,
  position: number,
): ScheduleTask[] {
  const index = buildTreeIndex(tasks);
  const task = requireTask(index, id);
  if (parentId !== null) {
    requireTask(index, parentId);
    if (parentId === id || isDescendantOf(index, parentId, id)) {
      throw new ScheduleRuleError(
        'hierarchy-cycle',
        'Uma tarefa não pode ficar dentro dela mesma ou de uma de suas subtarefas.',
      );
    }
  }
  return placeTask(tasks, task, parentId, position);
}

/** The task becomes the last child of the sibling right above it. */
export function indentTask(tasks: readonly ScheduleTask[], id: UUID): ScheduleTask[] {
  const index = buildTreeIndex(tasks);
  const task = requireTask(index, id);
  const siblings = getChildren(index, task.parentId);
  const position = siblings.findIndex((sibling) => sibling.id === id);
  const newParent = siblings[position - 1];
  if (!newParent) {
    throw new ScheduleRuleError(
      'cannot-indent',
      'Não há uma tarefa acima, no mesmo nível, para receber esta como subtarefa.',
    );
  }
  return placeTask(tasks, task, newParent.id, Number.POSITIVE_INFINITY);
}

/** The task moves one level up, right after its former parent. */
export function outdentTask(tasks: readonly ScheduleTask[], id: UUID): ScheduleTask[] {
  const index = buildTreeIndex(tasks);
  const task = requireTask(index, id);
  const parent = task.parentId === null ? undefined : index.byId.get(task.parentId);
  if (!parent) {
    throw new ScheduleRuleError('cannot-outdent', 'A tarefa já está no primeiro nível.');
  }
  const parentPosition = getChildren(index, parent.parentId).findIndex(
    (sibling) => sibling.id === parent.id,
  );
  return placeTask(tasks, task, parent.parentId, parentPosition + 1);
}

/** Moves a task one position up (`-1`) or down (`+1`) among its siblings. */
export function shiftTask(
  tasks: readonly ScheduleTask[],
  id: UUID,
  direction: -1 | 1,
): ScheduleTask[] {
  const index = buildTreeIndex(tasks);
  const task = requireTask(index, id);
  const siblings = getChildren(index, task.parentId);
  const position = siblings.findIndex((sibling) => sibling.id === id);
  const target = position + direction;
  if (target < 0 || target >= siblings.length) {
    throw new ScheduleRuleError(
      'cannot-move',
      direction < 0 ? 'A tarefa já é a primeira do grupo.' : 'A tarefa já é a última do grupo.',
    );
  }
  return placeTask(tasks, task, task.parentId, target);
}

/** Removes a task and all its descendants. */
export function removeTaskTree(
  tasks: readonly ScheduleTask[],
  id: UUID,
): { tasks: ScheduleTask[]; removedIds: Set<UUID> } {
  const index = buildTreeIndex(tasks);
  const task = requireTask(index, id);
  const removedIds = new Set([id, ...getDescendantIds(index, id)]);
  const remaining = tasks.filter((item) => !removedIds.has(item.id));
  const siblings = getChildren(buildTreeIndex(remaining, false), task.parentId);
  const renumbered = new Map(siblings.map((sibling, order) => [sibling.id, order]));
  return {
    tasks: remaining.map((item) => {
      const order = renumbered.get(item.id);
      return order === undefined || order === item.order ? item : { ...item, order };
    }),
    removedIds,
  };
}

/**
 * Copies a task and its descendants right after the original. Returns the new tasks and
 * a map from original to copy ids. Dependencies are not copied (see `duplicateTask`
 * in commands), so a copy never gets unexpected links to old tasks.
 */
export function copyTaskTree(
  tasks: readonly ScheduleTask[],
  id: UUID,
  generateId: () => UUID,
): { tasks: ScheduleTask[]; idMap: Map<UUID, UUID> } {
  const index = buildTreeIndex(tasks);
  const original = requireTask(index, id);
  const idMap = new Map<UUID, UUID>();
  for (const sourceId of [id, ...getDescendantIds(index, id)]) idMap.set(sourceId, generateId());

  const copies: ScheduleTask[] = [];
  for (const [sourceId, copyId] of idMap) {
    const source = requireTask(index, sourceId);
    copies.push({
      ...source,
      id: copyId,
      name: sourceId === id ? `${source.name} (cópia)` : source.name,
      parentId: sourceId === id ? source.parentId : (idMap.get(source.parentId ?? '') ?? null),
    });
  }

  const [rootCopy, ...descendants] = copies;
  if (!rootCopy) return { tasks: [...tasks], idMap };
  const withRoot = placeTask(
    [...tasks, ...descendants],
    rootCopy,
    original.parentId,
    original.order + 1,
  );
  return { tasks: withRoot, idMap };
}

/** Problems that make a stored hierarchy unusable (checked when loading data). */
export function findHierarchyProblems(tasks: readonly ScheduleTask[]): string[] {
  const problems: string[] = [];
  const ids = new Set<UUID>();
  for (const task of tasks) {
    if (ids.has(task.id)) problems.push(`Tarefa duplicada: ${task.id}.`);
    ids.add(task.id);
  }
  const index = buildTreeIndex(tasks);
  for (const task of tasks) {
    if (task.parentId !== null && !ids.has(task.parentId)) {
      problems.push(`A tarefa "${task.name}" aponta para uma tarefa pai inexistente.`);
    }
    let parentId = task.parentId;
    const seen = new Set<UUID>([task.id]);
    while (parentId !== null) {
      if (seen.has(parentId)) {
        problems.push(`A tarefa "${task.name}" está dentro dela mesma (ciclo na hierarquia).`);
        break;
      }
      seen.add(parentId);
      parentId = index.byId.get(parentId)?.parentId ?? null;
    }
  }
  return problems;
}

/**
 * Leaf tasks (tasks without subtasks, milestones included) that are not done yet.
 * Summary tasks never count: their work is their subtasks'.
 */
export function countPendingLeafTasks(tasks: readonly ScheduleTask[]): number {
  const parents = new Set(tasks.map((task) => task.parentId));
  return tasks.filter((task) => !parents.has(task.id) && task.progress < 100).length;
}

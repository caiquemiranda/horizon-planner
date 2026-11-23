import { workFromProgress } from '@/features/schedule/lib/checkIns';
import type { ISODate, UUID } from '@/types/project';
import type { DependencyType, ScheduleTask, TaskDependency } from '@/types/schedule';

/** Readable, deterministic ids for schedule tests: `task('A')` → `task-A`. */
export const taskId = (key: string): UUID => `task-${key}`;

export function makeTask(overrides: Partial<ScheduleTask> & { id: UUID }): ScheduleTask {
  return {
    parentId: null,
    order: 0,
    name: overrides.id,
    assignee: null,
    notes: '',
    mode: 'auto',
    start: '2026-11-23' as ISODate,
    duration: 1,
    progress: 0,
    // Consistent with the percentage the test asks for, unless given.
    completedWork: workFromProgress(overrides.progress ?? 0, overrides.duration ?? 1),
    actualStart: null,
    actualFinish: null,
    ...overrides,
  };
}

export interface OutlineNode {
  key: string;
  children?: OutlineNode[];
  task?: Partial<Omit<ScheduleTask, 'id' | 'parentId' | 'order'>>;
}

/** Builds a task list from a nested outline, assigning `parentId` and `order`. */
export function buildOutline(nodes: OutlineNode[], parentId: UUID | null = null): ScheduleTask[] {
  return nodes.flatMap((node, order) => [
    makeTask({ name: node.key, ...node.task, id: taskId(node.key), parentId, order }),
    ...buildOutline(node.children ?? [], taskId(node.key)),
  ]);
}

export function makeLink(
  predecessor: string,
  successor: string,
  type: DependencyType = 'FS',
  lag = 0,
): TaskDependency {
  return {
    id: `link-${predecessor}-${successor}-${type}`,
    predecessorId: taskId(predecessor),
    successorId: taskId(successor),
    type,
    lag,
  };
}

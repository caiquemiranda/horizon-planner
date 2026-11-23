import { isoDateToDay } from '@/features/timeline/lib/time';
import type { UUID } from '@/types/project';
import type {
  ProjectCalendar,
  ScheduledTask,
  ScheduleIssue,
  ScheduleResult,
  ScheduleTask,
  TaskDependency,
} from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

import { createWorkCalendar, type WorkCalendar } from './calendar';
import { sortTopologically } from './dependencies';
import { type LeafProgress, summarizeProgress } from './progress';
import { buildTreeIndex, getChildren, getTasksInWbsOrder, type TreeIndex } from './tree';

/**
 * Scheduling engine: turns tasks, links and a calendar into computed dates.
 *
 * Pure and independent from rendering: no pixels, no expansion state, no React. The same
 * input always gives the same output, whatever order records are stored in.
 *
 * Rules (documented in docs/planning-module.md):
 * - leaf tasks are placed in topological order of the precedence graph;
 * - an `auto` task starts on the latest of: its requested start and every bound its
 *   predecessors impose; a `manual` task keeps its requested start and reports violations;
 * - starts snap to the next working day; durations count working days;
 * - link bounds, with `lag` in working days (negative = lead):
 *     FS: successor start  ≥ predecessor finish + lag
 *     SS: successor start  ≥ predecessor start  + lag
 *     FF: successor finish ≥ predecessor finish + lag
 *     SF: successor finish ≥ predecessor start  + lag
 * - summary tasks span their descendants (min start, max finish); their progress comes
 *   from their leaf tasks, each weighing the same (see `progress.ts`).
 */

export interface ScheduleInput {
  tasks: readonly ScheduleTask[];
  dependencies: readonly TaskDependency[];
  calendar: ProjectCalendar;
}

interface Bound {
  start: DayNumber;
  dependency: TaskDependency;
}

function linkBound(
  link: TaskDependency,
  predecessor: ScheduledTask,
  duration: number,
  calendar: WorkCalendar,
): DayNumber {
  switch (link.type) {
    case 'FS':
      return calendar.nextWorkingDay(calendar.shiftBoundary(predecessor.finish, link.lag));
    case 'SS':
      return calendar.nextWorkingDay(calendar.shiftBoundary(predecessor.start, link.lag));
    case 'FF':
      return calendar.startFor(calendar.shiftBoundary(predecessor.finish, link.lag), duration);
    case 'SF':
      return calendar.startFor(calendar.shiftBoundary(predecessor.start, link.lag), duration);
  }
}

/** Last working day shown as "Término": the start for milestones, `finish - 1` otherwise. */
export function getDisplayFinish(task: Pick<ScheduledTask, 'start' | 'finish'>): DayNumber {
  return task.finish > task.start ? task.finish - 1 : task.start;
}

export function computeSchedule(input: ScheduleInput, index?: TreeIndex): ScheduleResult {
  const tree = index ?? buildTreeIndex(input.tasks);
  const calendar = createWorkCalendar(input.calendar);
  const wbsOrder = getTasksInWbsOrder(tree);
  const isSummary = (id: UUID) => getChildren(tree, id).length > 0;

  const result = new Map<UUID, ScheduledTask>();
  const issues = new Map<UUID, ScheduleIssue[]>();
  const addIssue = (id: UUID, issue: ScheduleIssue) => {
    issues.set(id, [...(issues.get(id) ?? []), issue]);
  };

  // Links between existing leaf tasks drive the schedule; others are reported.
  const activeLinks: TaskDependency[] = [];
  for (const link of input.dependencies) {
    const predecessor = tree.byId.get(link.predecessorId);
    const successor = tree.byId.get(link.successorId);
    if (!predecessor || !successor) continue;
    if (isSummary(predecessor.id) || isSummary(successor.id)) {
      addIssue(successor.id, {
        code: 'summary-link',
        message: 'Vínculo com tarefa resumo ignorado: vincule as subtarefas.',
        dependencyId: link.id,
      });
      continue;
    }
    activeLinks.push(link);
  }

  const incoming = new Map<UUID, TaskDependency[]>();
  for (const link of activeLinks) {
    incoming.set(link.successorId, [...(incoming.get(link.successorId) ?? []), link]);
  }

  const leafIds = wbsOrder.filter((task) => !isSummary(task.id)).map((task) => task.id);
  const { order, cyclicIds } = sortTopologically(leafIds, activeLinks);

  for (const id of order) {
    const task = tree.byId.get(id);
    if (!task) continue;
    const duration = Math.max(0, Math.round(task.duration));
    const requested = calendar.nextWorkingDay(isoDateToDay(task.start));

    const bounds: Bound[] = [];
    if (cyclicIds.has(id)) {
      addIssue(id, {
        code: 'dependency-cycle',
        message: 'Esta tarefa faz parte de um vínculo circular; seus vínculos foram ignorados.',
      });
    } else {
      for (const link of incoming.get(id) ?? []) {
        const predecessor = result.get(link.predecessorId);
        if (predecessor) {
          bounds.push({
            start: linkBound(link, predecessor, duration, calendar),
            dependency: link,
          });
        }
      }
    }

    let start = requested;
    let driving: TaskDependency | null = null;
    if (task.mode === 'auto') {
      for (const bound of bounds) {
        if (bound.start > start) {
          start = bound.start;
          driving = bound.dependency;
        }
      }
    } else {
      for (const bound of bounds) {
        if (bound.start > start) {
          addIssue(id, {
            code: 'dependency-violated',
            message: 'Agendamento manual em conflito com um vínculo: a tarefa começa cedo demais.',
            dependencyId: bound.dependency.id,
          });
        }
      }
    }

    result.set(id, {
      id,
      kind: duration === 0 ? 'milestone' : 'task',
      start,
      finish: calendar.finishFor(start, duration),
      duration,
      progress: task.progress,
      drivingDependencyId: driving?.id ?? null,
      issues: issues.get(id) ?? [],
    });
  }

  // Roll up summaries bottom-up (children before parents). Progress follows the rule in
  // `progress.ts`: every leaf task weighs the same; milestones only when alone.
  const leavesBelow = (id: UUID): LeafProgress[] => {
    const children = getChildren(tree, id);
    if (children.length === 0) {
      const leaf = result.get(id);
      return leaf ? [{ id, progress: leaf.progress, isMilestone: leaf.kind === 'milestone' }] : [];
    }
    return children.flatMap((child) => leavesBelow(child.id));
  };

  const rollUpProgress = (id: UUID) => summarizeProgress(leavesBelow(id)).progress;

  const rollUp = (task: ScheduleTask): ScheduledTask | undefined => {
    const children = getChildren(tree, task.id);
    if (children.length === 0) return result.get(task.id);
    const scheduled = children
      .map((child) => rollUp(child))
      .filter((child): child is ScheduledTask => child !== undefined);
    const first = scheduled[0];
    if (!first) return undefined;
    const start = Math.min(...scheduled.map((child) => child.start));
    const finish = Math.max(...scheduled.map((child) => child.finish));
    const summary: ScheduledTask = {
      id: task.id,
      kind: 'summary',
      start,
      finish,
      duration: calendar.countWorkingDays(start, finish),
      progress: rollUpProgress(task.id),
      drivingDependencyId: null,
      issues: issues.get(task.id) ?? [],
    };
    result.set(task.id, summary);
    return summary;
  };
  for (const root of getChildren(tree, null)) rollUp(root);

  const all = [...result.values()];
  const range =
    all.length === 0
      ? null
      : {
          start: Math.min(...all.map((task) => task.start)),
          finish: Math.max(...all.map((task) => task.finish)),
        };

  const completion = summarizeProgress(
    getChildren(tree, null).flatMap((root) => leavesBelow(root.id)),
  );

  return {
    tasks: result,
    range,
    progress: completion.progress,
    completion: { total: completion.total, done: completion.done },
  };
}

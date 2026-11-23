import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate, UUID } from '@/types/project';
import type { ProjectSchedule, ScheduleResult, TaskDependency } from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

import { createWorkCalendar } from './calendar';
import { sortTopologically } from './dependencies';
import { getDisplayFinish, linkBound } from './engine';
import { ScheduleRuleError } from './errors';
import { buildTreeIndex, getChildren } from './tree';

/**
 * Finish forecast: the plan replayed from what actually happened.
 *
 * The plan (`computeSchedule`) places every task from its requested start and its links.
 * The forecast keeps the same tasks, links and calendar, but:
 * - a **done** task stays where it really happened (`actualStart` / `actualFinish`);
 * - the **remaining work** of every other task (`duration - completedWork`, whole working
 *   days) cannot happen before the data date: today, or the next working day when today's
 *   work on that task is already confirmed;
 * - successors follow the forecast of their predecessors through the links, so a delay
 *   only moves the finish when it is on the path that drives it (slack absorbs the rest),
 *   and finishing early only brings the finish forward when the remaining work and the
 *   links allow it.
 *
 * It is a pure function of (schedule, today): computing it again for the same day gives
 * the same result, so a day is never counted twice, and a confirmation recorded later
 * (for an earlier date) simply gives the corrected forecast. It never changes the plan or
 * the baseline. A missing confirmation is treated as "not done yet" for the forecast only;
 * the agenda keeps showing it as pending.
 */

export type TaskProgressState = 'done' | 'in_progress' | 'not_started';

export interface TaskForecast {
  id: UUID;
  state: TaskProgressState;
  start: DayNumber;
  /** Exclusive, like the plan; equals `start` for milestones. */
  finish: DayNumber;
  /** Whole working days still to do. */
  remaining: number;
  /** Its own deviation from the plan: late (work not done when planned) or early (done before). */
  deviation: 'late' | 'early' | null;
  /** The link that placed it, when a predecessor did. */
  drivingDependencyId: UUID | null;
}

export interface ScheduleForecast {
  tasks: Map<UUID, TaskForecast>;
  /** Last working day of the plan, or `null` without tasks. */
  plannedFinish: DayNumber | null;
  /** Last working day of the forecast, or `null` without tasks. */
  forecastFinish: DayNumber | null;
  /** Working days from the planned to the forecast finish: positive is later. */
  variance: number;
  /**
   * Tasks on the path that drives the forecast finish whose own deviation moved it, from
   * the finish backwards. Empty when the forecast equals the plan.
   */
  causes: { taskId: UUID; deviation: 'late' | 'early' }[];
  /** The day the remaining work is placed from. */
  dataDate: DayNumber;
}

const EPSILON = 1e-9;

export function computeForecast(
  schedule: ProjectSchedule,
  plan: ScheduleResult,
  today: ISODate,
): ScheduleForecast {
  const tree = buildTreeIndex(schedule.tasks);
  const calendar = createWorkCalendar(schedule.calendar);
  const isSummary = (id: UUID) => getChildren(tree, id).length > 0;
  const todayDay = isoDateToDay(today);
  const dataDate = calendar.nextWorkingDay(todayDay);
  const confirmedToday = new Set(
    schedule.checkIns
      .filter((checkIn) => checkIn.workDate === today && checkIn.state === 'done')
      .map((checkIn) => checkIn.taskId),
  );

  // The same links the plan uses: between existing leaf tasks.
  const links: TaskDependency[] = schedule.dependencies.filter((link) => {
    const predecessor = tree.byId.get(link.predecessorId);
    const successor = tree.byId.get(link.successorId);
    return predecessor && successor && !isSummary(predecessor.id) && !isSummary(successor.id);
  });
  const incoming = new Map<UUID, TaskDependency[]>();
  for (const link of links) {
    incoming.set(link.successorId, [...(incoming.get(link.successorId) ?? []), link]);
  }
  const leafIds = schedule.tasks.filter((task) => !isSummary(task.id)).map((task) => task.id);
  const { order, cyclicIds } = sortTopologically(leafIds, links);

  const tasks = new Map<UUID, TaskForecast>();
  for (const id of order) {
    const task = tree.byId.get(id);
    const planned = plan.tasks.get(id);
    if (!task || !planned) continue;
    const duration = Math.max(0, Math.round(task.duration));
    const isMilestone = duration === 0;

    if (task.progress >= 100) {
      // What really happened. Without recorded dates (typed 100%), the plan stands.
      const finishDay = task.actualFinish ? isoDateToDay(task.actualFinish) : null;
      const startDay = task.actualStart
        ? isoDateToDay(task.actualStart)
        : finishDay !== null && isMilestone
          ? finishDay
          : planned.start;
      const finish = finishDay === null ? planned.finish : isMilestone ? finishDay : finishDay + 1;
      tasks.set(id, {
        id,
        state: 'done',
        start: Math.min(startDay, finish),
        finish,
        remaining: 0,
        deviation:
          finishDay === null
            ? null
            : finishDay < getDisplayFinish(planned)
              ? 'early'
              : finishDay > getDisplayFinish(planned)
                ? 'late'
                : null,
        drivingDependencyId: null,
      });
      continue;
    }

    const remaining = isMilestone ? 0 : Math.ceil(duration - task.completedWork - EPSILON);
    const ownDataDate = confirmedToday.has(id) ? calendar.nextWorkingDay(dataDate + 1) : dataDate;

    if (task.completedWork > EPSILON) {
      // Under way: the rest of its work continues from the data date.
      const start = ownDataDate;
      const finish = calendar.finishFor(start, remaining);
      tasks.set(id, {
        id,
        state: 'in_progress',
        start,
        finish,
        remaining,
        deviation:
          getDisplayFinish({ start, finish }) > getDisplayFinish(planned)
            ? 'late'
            : getDisplayFinish({ start, finish }) < getDisplayFinish(planned)
              ? 'early'
              : null,
        drivingDependencyId: null,
      });
      continue;
    }

    // Not started: its requested start and its links, as in the plan, from the forecast of
    // its predecessors, and never before the data date.
    let start = calendar.nextWorkingDay(isoDateToDay(task.start));
    let driving: UUID | null = null;
    if (!cyclicIds.has(id) && task.mode === 'auto') {
      for (const link of incoming.get(id) ?? []) {
        const predecessor = tasks.get(link.predecessorId);
        if (!predecessor) continue;
        const bound = linkBound(link, predecessor, remaining, calendar);
        if (bound > start) {
          start = bound;
          driving = link.id;
        }
      }
    }
    let deviation: TaskForecast['deviation'] = null;
    if (ownDataDate > start) {
      start = ownDataDate;
      driving = null;
      deviation = 'late';
    }
    tasks.set(id, {
      id,
      state: 'not_started',
      start,
      finish: isMilestone ? start : calendar.finishFor(start, remaining),
      remaining,
      deviation,
      drivingDependencyId: driving,
    });
  }

  let plannedFinish: DayNumber | null = null;
  for (const task of plan.tasks.values()) {
    if (task.kind === 'summary') continue;
    const day = getDisplayFinish(task);
    if (plannedFinish === null || day > plannedFinish) plannedFinish = day;
  }
  let forecastFinish: DayNumber | null = null;
  let lastId: UUID | null = null;
  for (const task of tasks.values()) {
    const day = getDisplayFinish(task);
    if (forecastFinish === null || day > forecastFinish) {
      forecastFinish = day;
      lastId = task.id;
    }
  }

  const variance =
    plannedFinish === null || forecastFinish === null
      ? 0
      : forecastFinish >= plannedFinish
        ? calendar.countWorkingDays(
            calendar.nextWorkingDay(plannedFinish),
            calendar.nextWorkingDay(forecastFinish),
          )
        : -calendar.countWorkingDays(
            calendar.nextWorkingDay(forecastFinish),
            calendar.nextWorkingDay(plannedFinish),
          );

  return {
    tasks,
    plannedFinish,
    forecastFinish,
    variance,
    causes: variance === 0 ? [] : findCauses(tasks, links, lastId, variance > 0 ? 'late' : 'early'),
    dataDate,
  };
}

/**
 * Walks the driving path back from the task that ends last and keeps the tasks whose own
 * deviation (same direction as the variance) moved it.
 */
function findCauses(
  tasks: Map<UUID, TaskForecast>,
  links: readonly TaskDependency[],
  lastId: UUID | null,
  direction: 'late' | 'early',
): ScheduleForecast['causes'] {
  const byId = new Map(links.map((link) => [link.id, link]));
  const causes: ScheduleForecast['causes'] = [];
  const seen = new Set<UUID>();
  let current = lastId ? tasks.get(lastId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.deviation === direction) causes.push({ taskId: current.id, deviation: direction });
    const link = current.drivingDependencyId ? byId.get(current.drivingDependencyId) : undefined;
    current = link ? tasks.get(link.predecessorId) : undefined;
  }
  // Finishing early is decided by the done tasks before the first task placed by a link.
  if (direction === 'early' && causes.length === 0) {
    for (const task of tasks.values()) {
      if (task.deviation === 'early') causes.push({ taskId: task.id, deviation: 'early' });
    }
  }
  return causes;
}

/** Working days from `from` to `to` (last working days): positive when `to` is later. */
export function workingDayVariance(
  schedule: Pick<ProjectSchedule, 'calendar'>,
  from: DayNumber,
  to: DayNumber,
): number {
  const calendar = createWorkCalendar(schedule.calendar);
  return to >= from
    ? calendar.countWorkingDays(calendar.nextWorkingDay(from), calendar.nextWorkingDay(to))
    : -calendar.countWorkingDays(calendar.nextWorkingDay(to), calendar.nextWorkingDay(from));
}

/** Saves the plan's current dates as the baseline (replacing a previous one). */
export function saveBaseline(
  schedule: ProjectSchedule,
  plan: ScheduleResult,
  now: string,
): ProjectSchedule {
  const tree = buildTreeIndex(schedule.tasks);
  const tasks: Record<UUID, { start: ISODate; finish: ISODate }> = {};
  let finish: DayNumber | null = null;
  for (const task of plan.tasks.values()) {
    if (getChildren(tree, task.id).length > 0) continue;
    const last = getDisplayFinish(task);
    tasks[task.id] = { start: dayToIsoDate(task.start), finish: dayToIsoDate(last) };
    if (finish === null || last > finish) finish = last;
  }
  if (finish === null) {
    throw new ScheduleRuleError('invalid-field', 'Crie tarefas antes de salvar a linha de base.');
  }
  return { ...schedule, baseline: { savedAt: now, finish: dayToIsoDate(finish), tasks } };
}

export function clearBaseline(schedule: ProjectSchedule): ProjectSchedule {
  return { ...schedule, baseline: null };
}

/** "+1 dia útil", "-2 dias úteis", "no prazo". */
export function formatVariance(days: number): string {
  if (days === 0) return 'no prazo';
  const size = Math.abs(days) === 1 ? '1 dia útil' : `${String(Math.abs(days))} dias úteis`;
  return `${days > 0 ? '+' : '-'}${size}`;
}

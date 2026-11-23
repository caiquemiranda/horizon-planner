import { isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate, ISODateTime, UUID } from '@/types/project';
import type {
  CheckInState,
  DailyCheckIn,
  ProjectSchedule,
  ScheduledTask,
  ScheduleResult,
  ScheduleTask,
} from '@/types/schedule';

import type { WorkCalendar } from './calendar';
import { ScheduleRuleError } from './errors';
import { buildTreeIndex, getChildren } from './tree';

/**
 * Daily check-ins: confirming, for one task and one working date, that the work planned
 * for that day was done (and how much) or was not done.
 *
 * Rules:
 * - at most one check-in per task and date: recording again replaces it, so repeating a
 *   confirmation (double click, retry) never counts twice;
 * - "done" adds working days to the task's `completedWork`; the task is complete only when
 *   its completed work reaches its duration, so confirming one day of a 5-day task does not
 *   close it;
 * - "not done" records the fact and adds nothing; a day without a check-in is pending
 *   confirmation, never assumed done or not done;
 * - check-ins are for leaf tasks and for days up to today (work cannot be confirmed in
 *   advance); a date in the past can be confirmed later, keeping the history;
 * - undoing removes the check-in and takes its work back.
 */

/** Smallest amount of work that can be confirmed: half a working day. */
export const WORK_STEP = 0.5;

const EPSILON = 1e-9;

/** Working days of work behind a percentage (used when the user edits the percentage). */
export function workFromProgress(progress: number, duration: number): number {
  return Math.round(((progress * duration) / 100) * 1000) / 1000;
}

/**
 * Percentage shown for an amount of work: 100% only when the work is all done, and never
 * 0% once some work was done.
 */
export function progressFromWork(work: number, duration: number, milestoneDone = false): number {
  if (duration <= 0) return milestoneDone ? 100 : 0;
  if (work >= duration - EPSILON) return 100;
  if (work <= EPSILON) return 0;
  return Math.min(99, Math.max(1, Math.round((work / duration) * 100)));
}

export interface CheckInRequest {
  taskId: UUID;
  workDate: ISODate;
  state: CheckInState;
  /** Working days done that day (for `done`); defaults to one day, or what remains. */
  units?: number;
}

export interface CheckInContext {
  today: ISODate;
  now: ISODateTime;
  generateId: () => UUID;
}

function requireLeaf(schedule: ProjectSchedule, taskId: UUID): ScheduleTask {
  const index = buildTreeIndex(schedule.tasks);
  const task = index.byId.get(taskId);
  if (!task) throw new ScheduleRuleError('task-not-found', 'A tarefa não existe mais.');
  if (getChildren(index, taskId).length > 0) {
    throw new ScheduleRuleError(
      'summary-derived',
      'Tarefas resumo não recebem confirmações: confirme as subtarefas.',
    );
  }
  return task;
}

function findCheckIn(schedule: ProjectSchedule, taskId: UUID, workDate: ISODate) {
  return schedule.checkIns.find(
    (checkIn) => checkIn.taskId === taskId && checkIn.workDate === workDate,
  );
}

/** Recomputes a task's work, percentage and actual dates from a new set of check-ins. */
function applyWork(
  task: ScheduleTask,
  checkIns: readonly DailyCheckIn[],
  workDelta: number,
): ScheduleTask {
  const isMilestone = task.duration === 0;
  const doneDates = checkIns
    .filter((checkIn) => checkIn.taskId === task.id && checkIn.state === 'done')
    .map((checkIn) => checkIn.workDate)
    .sort();
  const completedWork = isMilestone
    ? 0
    : Math.min(
        task.duration,
        Math.max(0, Math.round((task.completedWork + workDelta) * 1000) / 1000),
      );
  const progress = isMilestone
    ? doneDates.length > 0
      ? 100
      : 0
    : progressFromWork(completedWork, task.duration);
  const firstDone = doneDates[0] ?? null;
  const lastDone = doneDates.at(-1) ?? null;
  return {
    ...task,
    completedWork,
    progress,
    actualStart:
      firstDone && (!task.actualStart || firstDone < task.actualStart)
        ? firstDone
        : task.actualStart,
    actualFinish: progress === 100 ? lastDone : null,
  };
}

/**
 * Records (or replaces) the check-in of one task on one date.
 *
 * @throws {ScheduleRuleError} for a summary task, a future date or an invalid amount.
 */
export function recordCheckIn(
  schedule: ProjectSchedule,
  request: CheckInRequest,
  context: CheckInContext,
): ProjectSchedule {
  const task = requireLeaf(schedule, request.taskId);
  if (request.workDate > context.today) {
    throw new ScheduleRuleError(
      'invalid-field',
      'Só é possível confirmar o trabalho de hoje ou de dias anteriores.',
    );
  }

  const previous = findCheckIn(schedule, task.id, request.workDate);
  const previousUnits = previous?.state === 'done' ? previous.units : 0;
  // What could still be done that day: the remaining work plus what this day already had.
  const available = Math.max(0, task.duration - task.completedWork + previousUnits);

  let units = 0;
  if (request.state === 'done' && task.duration > 0) {
    units = request.units ?? Math.min(1, available);
    // Half-day steps, except for finishing exactly what remains (e.g. 1,2 days left from a
    // percentage typed before check-ins existed).
    const finishesTask = Math.abs(units - available) <= EPSILON;
    if (!(units > 0) || (!finishesTask && units % WORK_STEP !== 0)) {
      throw new ScheduleRuleError(
        'invalid-field',
        'Informe o trabalho feito em dias, de meio em meio dia (ex.: 0,5 ou 1).',
      );
    }
    if (units > available + EPSILON) {
      throw new ScheduleRuleError(
        'invalid-field',
        available <= EPSILON
          ? 'Esta tarefa já está concluída.'
          : `Restam ${formatDays(available)} de trabalho nesta tarefa.`,
      );
    }
  }

  const checkIn: DailyCheckIn = {
    id: previous?.id ?? context.generateId(),
    taskId: task.id,
    workDate: request.workDate,
    state: request.state,
    units,
    recordedAt: context.now,
  };
  const checkIns = previous
    ? schedule.checkIns.map((item) => (item === previous ? checkIn : item))
    : [...schedule.checkIns, checkIn];
  const updated = applyWork(task, checkIns, units - previousUnits);

  return {
    ...schedule,
    checkIns,
    tasks: schedule.tasks.map((item) => (item.id === task.id ? updated : item)),
  };
}

/** Confirms all the remaining work of a task on one date: the task becomes complete. */
export function completeTaskOn(
  schedule: ProjectSchedule,
  taskId: UUID,
  workDate: ISODate,
  context: CheckInContext,
): ProjectSchedule {
  const task = requireLeaf(schedule, taskId);
  const previous = findCheckIn(schedule, taskId, workDate);
  const previousUnits = previous?.state === 'done' ? previous.units : 0;
  const remaining = task.duration - task.completedWork + previousUnits;
  if (task.duration > 0 && remaining <= EPSILON) {
    throw new ScheduleRuleError('invalid-field', 'Esta tarefa já está concluída.');
  }
  return recordCheckIn(
    schedule,
    {
      taskId,
      workDate,
      state: 'done',
      ...(task.duration > 0 ? { units: Math.round(remaining * 1000) / 1000 } : {}),
    },
    context,
  );
}

/** Undoes the check-in of one task on one date (its work is taken back). */
export function removeCheckIn(
  schedule: ProjectSchedule,
  taskId: UUID,
  workDate: ISODate,
): ProjectSchedule {
  const previous = findCheckIn(schedule, taskId, workDate);
  if (!previous) return schedule;
  const task = requireLeaf(schedule, taskId);
  const checkIns = schedule.checkIns.filter((item) => item !== previous);
  const updated = applyWork(task, checkIns, previous.state === 'done' ? -previous.units : 0);
  return {
    ...schedule,
    checkIns,
    tasks: schedule.tasks.map((item) => (item.id === taskId ? updated : item)),
  };
}

/** "1 dia", "2,5 dias"; at most one decimal for work that came from a percentage. */
export function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  return rounded === 1 ? '1 dia' : `${String(rounded).replace('.', ',')} dias`;
}

// ── Daily agenda ──────────────────────────────────────────────────────────────────────

/**
 * - `pending`: no confirmation yet for that date;
 * - `done` / `not_done`: what was confirmed for that date.
 */
export type AgendaState = 'pending' | CheckInState;

export interface AgendaItem {
  task: ScheduleTask;
  scheduled: ScheduledTask;
  state: AgendaState;
  checkIn: DailyCheckIn | null;
  /** Planned to end before this date and not complete. */
  overdue: boolean;
  /** All its work is done. */
  complete: boolean;
}

export interface DailyAgenda {
  date: ISODate;
  /** The project calendar has no work on this date (weekend, holiday). */
  isWorkingDay: boolean;
  /** Leaf tasks planned for this date, in WBS order. */
  planned: AgendaItem[];
  /** Leaf tasks that should have ended before this date and are not complete. */
  overdue: AgendaItem[];
}

/**
 * What a date asks to confirm: the leaf tasks planned for it (their computed range covers
 * it, or a milestone falls on it) and the ones already late. Days off ask nothing.
 */
export function getDailyAgenda(
  schedule: ProjectSchedule,
  result: ScheduleResult,
  calendar: WorkCalendar,
  date: ISODate,
): DailyAgenda {
  const day = isoDateToDay(date);
  const isWorkingDay = calendar.isWorkingDay(day);
  const index = buildTreeIndex(schedule.tasks);
  const planned: AgendaItem[] = [];
  const overdue: AgendaItem[] = [];

  for (const task of orderedLeaves(index)) {
    const scheduled = result.tasks.get(task.id);
    if (!scheduled) continue;
    const checkIn = findCheckIn(schedule, task.id, date) ?? null;
    const complete = task.progress >= 100;
    const item: AgendaItem = {
      task,
      scheduled,
      state: checkIn?.state ?? 'pending',
      checkIn,
      overdue: false,
      complete,
    };
    const isMilestone = scheduled.kind === 'milestone';
    const coversDay = isMilestone
      ? scheduled.start === day
      : scheduled.start <= day && day < scheduled.finish;
    if (coversDay && isWorkingDay) {
      planned.push(item);
    } else if (!complete && (isMilestone ? scheduled.start < day : scheduled.finish <= day)) {
      overdue.push({ ...item, overdue: true });
    } else if (checkIn) {
      // Confirmed on a day it was not planned for (early or extra work): keep it visible.
      planned.push(item);
    }
  }
  return { date, isWorkingDay, planned, overdue };
}

function orderedLeaves(index: ReturnType<typeof buildTreeIndex>): ScheduleTask[] {
  const leaves: ScheduleTask[] = [];
  const visit = (parentId: UUID | null) => {
    for (const child of getChildren(index, parentId)) {
      if (getChildren(index, child.id).length === 0) leaves.push(child);
      else visit(child.id);
    }
  };
  visit(null);
  return leaves;
}

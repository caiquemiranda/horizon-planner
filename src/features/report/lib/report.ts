import { STATUS_META } from '@/features/projects/constants';
import { formatPredecessors } from '@/features/schedule/lib/dependencies';
import { computeSchedule, getDisplayFinish } from '@/features/schedule/lib/engine';
import { computeForecast, workingDayVariance } from '@/features/schedule/lib/forecast';
import { summarizeProgress } from '@/features/schedule/lib/progress';
import {
  buildTreeIndex,
  getChildren,
  getDescendantIds,
  getWbsNumbers,
} from '@/features/schedule/lib/tree';
import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate, ISODateTime, Project, UUID } from '@/types/project';
import type { ProjectSchedule, ScheduleResult, TaskKind } from '@/types/schedule';

/**
 * Project report read model (spec REQ-RPT-01–03): one function of the project, its
 * schedule and the data date, composing the rules the app already uses. It adds no
 * formula of its own:
 *
 * - progress is `summarizeProgress` (leaf tasks only, each weighs the same, milestones
 *   are checkpoints), the same number as the table, the Gantt and the portfolio;
 * - task states follow the table: done at 100%, late when the last planned working day
 *   is before the data date and the work is not done, in progress when started, else
 *   not started. Future work is never late. In a final report, unfinished work is "not
 *   done" (the project is closed: nothing is late any more);
 * - planned finish, forecast and actual finish are different quantities, each labelled;
 *   the forecast is `computeForecast` and is not shown for postponed or closed projects,
 *   like in the workspace;
 * - there is no history of past states (audit decision 3), so the report is "as of now"
 *   and has no progress curve.
 */

export type ReportKind = 'progress' | 'final';

export type ReportTaskState = 'done' | 'in_progress' | 'late' | 'not_started' | 'not_done';

export const REPORT_TASK_STATES: readonly ReportTaskState[] = [
  'done',
  'in_progress',
  'late',
  'not_started',
  'not_done',
];

export const REPORT_STATE_LABELS: Record<ReportTaskState, string> = {
  done: 'Concluída',
  in_progress: 'Em andamento',
  late: 'Atrasada',
  not_started: 'Não iniciada',
  not_done: 'Não concluída',
};

export interface ReportRow {
  id: UUID;
  wbs: string;
  name: string;
  /** 0 for root tasks. */
  depth: number;
  kind: TaskKind;
  assignee: string | null;
  start: ISODate;
  /** Last working day (the milestone's own day). */
  finish: ISODate;
  /** Working days (summaries: their span). */
  duration: number;
  progress: number;
  /** Leaf tasks only; summaries roll up. */
  state: ReportTaskState | null;
  predecessors: string;
}

export interface ReportPhase {
  id: UUID;
  wbs: string;
  name: string;
  progress: number;
  done: number;
  total: number;
}

export interface ReportMilestone {
  id: UUID;
  wbs: string;
  name: string;
  date: ISODate;
  done: boolean;
  /** Its day passed and it is not done (never in a final report). */
  overdue: boolean;
}

export interface ProjectReport {
  kind: ReportKind;
  title: string;
  /** The data date: the day the states are computed for. */
  asOf: ISODate;
  generatedAt: ISODateTime;
  project: Project;
  hasSchedule: boolean;
  progress: { percent: number; done: number; total: number };
  /** Work tasks (leaves that are not milestones) by state; the states never overlap. */
  states: Record<ReportTaskState, number>;
  workTasks: number;
  milestones: ReportMilestone[];
  dates: {
    plannedStart: ISODate;
    plannedFinish: ISODate;
    /** `null` when the project has no running forecast (postponed, closed, no tasks). */
    forecastFinish: ISODate | null;
    /** Working days from the planned to the forecast finish (positive: later). */
    forecastVariance: number | null;
    baselineFinish: ISODate | null;
    /** Working days from the baseline to the forecast (or actual) finish. */
    baselineVariance: number | null;
    /** The completion or closing date, for closed projects. */
    actualFinish: ISODate | null;
  };
  phases: ReportPhase[];
  rows: ReportRow[];
  attention: {
    late: ReportRow[];
    inProgress: ReportRow[];
    /** Not started work, by planned start (at most five). */
    next: ReportRow[];
    upcomingMilestones: ReportMilestone[];
  };
  checkIns: { done: number; notDone: number; last: ISODate | null };
  /** Deterministic sentences, each from a number above. */
  highlights: string[];
}

export interface ReportInput {
  project: Project;
  schedule: ProjectSchedule | null;
  today: ISODate;
  now: Date;
  /** The plan, when the caller already computed it. */
  result?: ScheduleResult;
}

const NEXT_LIMIT = 5;

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function stateOf(
  kind: ReportKind,
  progress: number,
  lastDay: number,
  today: number,
): ReportTaskState {
  if (progress >= 100) return 'done';
  if (kind === 'final') return 'not_done';
  if (lastDay < today) return 'late';
  if (progress > 0) return 'in_progress';
  return 'not_started';
}

export function buildProjectReport({
  project,
  schedule,
  today,
  now,
  result: givenResult,
}: ReportInput): ProjectReport {
  const closed = STATUS_META[project.status].isClosed;
  const kind: ReportKind = closed ? 'final' : 'progress';
  const todayDay = isoDateToDay(today);
  const tasks = schedule?.tasks ?? [];
  const index = buildTreeIndex(tasks);
  const result = givenResult ?? (schedule ? computeSchedule(schedule, index) : null);
  const wbsById = getWbsNumbers(index);

  const rows: ReportRow[] = [];
  const visit = (parentId: UUID | null, depth: number) => {
    for (const task of getChildren(index, parentId)) {
      const scheduled = result?.tasks.get(task.id);
      if (!scheduled) continue;
      const lastDay = getDisplayFinish(scheduled);
      rows.push({
        id: task.id,
        wbs: wbsById.get(task.id) ?? '',
        name: task.name,
        depth,
        kind: scheduled.kind,
        assignee: task.assignee,
        start: dayToIsoDate(scheduled.start),
        finish: dayToIsoDate(lastDay),
        duration: scheduled.duration,
        progress: scheduled.progress,
        state:
          scheduled.kind === 'summary'
            ? null
            : stateOf(kind, scheduled.progress, lastDay, todayDay),
        predecessors: schedule ? formatPredecessors(task.id, schedule.dependencies, wbsById) : '',
      });
      visit(task.id, depth + 1);
    }
  };
  visit(null, 0);

  const leaves = rows.filter((row) => row.kind !== 'summary');
  const work = leaves.filter((row) => row.kind === 'task');
  const states = Object.fromEntries(REPORT_TASK_STATES.map((state) => [state, 0])) as Record<
    ReportTaskState,
    number
  >;
  for (const row of work) if (row.state) states[row.state] += 1;

  const summary = summarizeProgress(
    leaves.map((row) => ({
      id: row.id,
      progress: row.progress,
      isMilestone: row.kind === 'milestone',
    })),
  );
  const hasSchedule = rows.length > 0;
  const progress = hasSchedule
    ? { percent: summary.progress, done: summary.done, total: summary.total }
    : { percent: project.progress, done: 0, total: 0 };

  const milestones: ReportMilestone[] = leaves
    .filter((row) => row.kind === 'milestone')
    .map((row) => {
      const done = row.progress >= 100;
      return {
        id: row.id,
        wbs: row.wbs,
        name: row.name,
        date: row.start,
        done,
        overdue: !done && kind === 'progress' && isoDateToDay(row.start) < todayDay,
      };
    });

  const phases: ReportPhase[] = rows
    .filter((row) => row.kind === 'summary' && row.depth === 0)
    .map((row) => {
      const below = new Set(getDescendantIds(index, row.id));
      const phase = summarizeProgress(
        leaves
          .filter((leaf) => below.has(leaf.id))
          .map((leaf) => ({
            id: leaf.id,
            progress: leaf.progress,
            isMilestone: leaf.kind === 'milestone',
          })),
      );
      return {
        id: row.id,
        wbs: row.wbs,
        name: row.name,
        progress: phase.progress,
        done: phase.done,
        total: phase.total,
      };
    });

  // Dates: the plan, the forecast (running projects only) and what really happened.
  const suspended = project.status === 'paused' || closed;
  const forecast = schedule && result?.range ? computeForecast(schedule, result, today) : null;
  const plannedStart = result?.range ? dayToIsoDate(result.range.start) : project.startDate;
  const plannedFinish =
    forecast?.plannedFinish != null ? dayToIsoDate(forecast.plannedFinish) : project.endDate;
  const forecastFinish =
    !suspended && forecast?.forecastFinish != null ? dayToIsoDate(forecast.forecastFinish) : null;
  const actualFinish = project.lifecycle.completedAt ?? project.lifecycle.closedAt ?? null;
  const baselineFinish = schedule?.baseline?.finish ?? null;
  const reference = actualFinish ?? forecastFinish;
  const baselineVariance =
    schedule && baselineFinish && reference
      ? workingDayVariance(schedule, isoDateToDay(baselineFinish), isoDateToDay(reference))
      : null;

  const late = leaves.filter((row) => row.state === 'late');
  const inProgress = work.filter((row) => row.state === 'in_progress');
  const next = work
    .filter((row) => row.state === 'not_started')
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) || a.wbs.localeCompare(b.wbs, undefined, { numeric: true }),
    )
    .slice(0, NEXT_LIMIT);
  const upcomingMilestones = milestones
    .filter((milestone) => !milestone.done && !milestone.overdue)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, NEXT_LIMIT);

  const checkIns = schedule?.checkIns ?? [];
  const lastCheckIn = checkIns.reduce<ISODate | null>(
    (latest, checkIn) => (latest === null || checkIn.workDate > latest ? checkIn.workDate : latest),
    null,
  );

  const highlights: string[] = [];
  if (hasSchedule) {
    highlights.push(
      `${String(progress.done)} de ${plural(progress.total, 'tarefa concluída', 'tarefas concluídas')} (${String(progress.percent)}%).`,
    );
    if (forecastFinish && forecast) {
      highlights.push(
        forecast.variance === 0
          ? 'Previsão de término igual ao planejado.'
          : `Previsão de término ${plural(Math.abs(forecast.variance), 'dia útil', 'dias úteis')} ${forecast.variance > 0 ? 'depois' : 'antes'} do planejado.`,
      );
    }
    if (kind === 'progress') {
      highlights.push(
        late.length === 0
          ? 'Nenhuma atividade vencida na data de corte.'
          : `${plural(late.length, 'atividade vencida', 'atividades vencidas')} na data de corte.`,
      );
    } else {
      const notDone = leaves.filter((row) => row.state === 'not_done').length;
      highlights.push(
        notDone === 0
          ? 'Todas as tarefas foram concluídas.'
          : `${plural(notDone, 'tarefa ficou', 'tarefas ficaram')} sem conclusão.`,
      );
    }
    if (milestones.length > 0) {
      highlights.push(
        `${String(milestones.filter((milestone) => milestone.done).length)} de ${plural(milestones.length, 'marco atingido', 'marcos atingidos')}.`,
      );
    }
  }

  return {
    kind,
    title: kind === 'final' ? 'Relatório final' : 'Relatório de andamento',
    asOf: today,
    generatedAt: now.toISOString(),
    project,
    hasSchedule,
    progress,
    states,
    workTasks: work.length,
    milestones,
    dates: {
      plannedStart,
      plannedFinish,
      forecastFinish,
      forecastVariance: forecastFinish && forecast ? forecast.variance : null,
      baselineFinish,
      baselineVariance,
      actualFinish,
    },
    phases,
    rows,
    attention: { late, inProgress, next, upcomingMilestones },
    checkIns: {
      done: checkIns.filter((checkIn) => checkIn.state === 'done').length,
      notDone: checkIns.filter((checkIn) => checkIn.state === 'not_done').length,
      last: lastCheckIn,
    },
    highlights,
  };
}

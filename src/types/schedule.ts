import type { ISODate, ISODateTime, UUID } from './project';
import type { DayNumber } from './timeline';

/**
 * Domain model of a project's schedule: the work breakdown structure (WBS), the
 * precedence links between tasks and the calendar used to count working days.
 *
 * Two relations are deliberately separate:
 * - hierarchy (`parentId` + `order`): which tasks group which;
 * - precedence (`TaskDependency`): which task must finish/start before another.
 * Being a child of a task never implies depending on it.
 *
 * Conventions (see docs/planning-module.md):
 * - dates are date-only `yyyy-MM-dd` strings; all math uses integer day numbers;
 * - durations are counted in working days of the project calendar;
 * - internally a task occupies the half-open range `[start, finish)`, where `finish`
 *   is the day after its last working day. The UI shows `finish - 1` as "Término".
 */

/** 0 = Sunday … 6 = Saturday, like `Date#getUTCDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CalendarHoliday {
  date: ISODate;
  name: string;
}

export interface ProjectCalendar {
  /** Days of the week that count as working days. At least one. */
  workingWeekdays: Weekday[];
  /** Non-working dates, e.g. public holidays. Configured per project, never hardcoded. */
  holidays: CalendarHoliday[];
}

/**
 * - `auto`: the engine places the task: never before `start` (a "start no earlier than"
 *   constraint) and never before what its predecessors allow.
 * - `manual`: the task stays where the user put it; broken links are reported, not fixed.
 */
export const SCHEDULING_MODES = ['auto', 'manual'] as const;
export type SchedulingMode = (typeof SCHEDULING_MODES)[number];

export interface ScheduleTask {
  id: UUID;
  /** `null` for root tasks. */
  parentId: UUID | null;
  /** Position among siblings (0-based, contiguous after every operation). */
  order: number;
  name: string;
  /** Free-form owner (person or team); the product has no user directory yet. */
  assignee: string | null;
  notes: string;
  mode: SchedulingMode;
  /** Requested start. For `auto` tasks the computed start may be later. */
  start: ISODate;
  /**
   * Working days. `0` makes a leaf task a milestone. Ignored for summary tasks, whose
   * range is derived from their descendants.
   */
  duration: number;
  /** Integer 0–100. Ignored for summary tasks (rolled up). Derived from `completedWork`. */
  progress: number;
  /**
   * Working days of work already done (0 to `duration`). The precise quantity behind
   * `progress`: daily check-ins add to it, and editing the percentage sets it. The rest,
   * `duration - completedWork`, is the remaining work used by the forecast.
   */
  completedWork: number;
  /** First day work was confirmed (daily check-ins). */
  actualStart: ISODate | null;
  /** Day the last remaining work was confirmed; `null` while the task is not done. */
  actualFinish: ISODate | null;
}

/**
 * - `done`: the work planned for that day was done (`units` working days of it);
 * - `not_done`: it was not done that day (a fact the user states, never assumed).
 * A day without a check-in is "pending confirmation", not "not done".
 */
export const CHECK_IN_STATES = ['done', 'not_done'] as const;
export type CheckInState = (typeof CHECK_IN_STATES)[number];

/** What was confirmed for one task on one working date. At most one per task and date. */
export interface DailyCheckIn {
  id: UUID;
  taskId: UUID;
  /** The day the work refers to (may be earlier than when it was recorded). */
  workDate: ISODate;
  state: CheckInState;
  /** Working days of work done that day; 0 for `not_done`. */
  units: number;
  /** When it was recorded, for the audit trail. */
  recordedAt: ISODateTime;
}

/**
 * A copy of the plan's dates at one moment ("linha de base"). Saved only on request and
 * never moved by edits, confirmations or the forecast, so the original commitment and the
 * variance against it stay visible.
 */
export interface ScheduleBaseline {
  savedAt: ISODateTime;
  /** Last working day of the plan when saved. */
  finish: ISODate;
  /** Planned start and last working day of every leaf task when saved. */
  tasks: Record<UUID, { start: ISODate; finish: ISODate }>;
}

export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export interface TaskDependency {
  id: UUID;
  predecessorId: UUID;
  successorId: UUID;
  type: DependencyType;
  /** Working days; negative values are leads. */
  lag: number;
}

export interface ProjectSchedule {
  projectId: UUID;
  /** Incremented on every save; used to detect concurrent edits (other tabs). */
  revision: number;
  calendar: ProjectCalendar;
  tasks: ScheduleTask[];
  dependencies: TaskDependency[];
  /** Daily confirmations of work, oldest first. */
  checkIns: DailyCheckIn[];
  /** The approved plan saved by the user, kept as the reference; `null` until saved. */
  baseline: ScheduleBaseline | null;
  updatedAt: ISODateTime;
}

export type TaskKind = 'task' | 'summary' | 'milestone';

/** Why a task cannot honour every rule; shown next to the task, never hidden. */
export interface ScheduleIssue {
  code: 'dependency-violated' | 'dependency-cycle' | 'summary-link';
  message: string;
  dependencyId?: UUID;
}

/** Result of the scheduling engine for one task. Derived, never persisted. */
export interface ScheduledTask {
  id: UUID;
  kind: TaskKind;
  /** First working day. */
  start: DayNumber;
  /** Exclusive end: the day after the last working day (equals `start` for milestones). */
  finish: DayNumber;
  /** Working days between `start` and `finish`. */
  duration: number;
  /** 0–100; rolled up for summaries from their leaf tasks (see `progress.ts`). */
  progress: number;
  /** The dependency that pushed an `auto` task past its requested start, if any. */
  drivingDependencyId: UUID | null;
  issues: ScheduleIssue[];
}

export interface ScheduleResult {
  tasks: Map<UUID, ScheduledTask>;
  /** Whole schedule range, or `null` without tasks. */
  range: { start: DayNumber; finish: DayNumber } | null;
  /** Progress of the whole schedule: every leaf task weighs the same (see `progress.ts`). */
  progress: number;
  /** Eligible leaf tasks and how many are done (100%), behind `progress`. */
  completion: { total: number; done: number };
}

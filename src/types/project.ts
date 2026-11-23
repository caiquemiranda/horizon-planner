/**
 * Core domain model for Horizon projects.
 *
 * Dates are stored as calendar strings (`yyyy-MM-dd`) to avoid timezone and DST issues.
 * All pixel math converts them to day numbers (see ADR-002 in docs/architecture.md).
 */

/** Calendar date without time or timezone, formatted as `yyyy-MM-dd`. */
export type ISODate = string & { readonly __brand: 'ISODate' };

/** Full ISO-8601 timestamp, used for audit fields. */
export type ISODateTime = string;

export type UUID = string;

export const HORIZONS = ['short', 'medium', 'long'] as const;
export type Horizon = (typeof HORIZONS)[number];

export const PROJECT_STATUSES = [
  'planned',
  'in_progress',
  'paused',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Closed palette so every color has guaranteed contrast in both themes. */
export const PROJECT_COLORS = [
  'slate',
  'blue',
  'violet',
  'pink',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'cyan',
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export interface Milestone {
  id: UUID;
  title: string;
  /** Must fall between the project's start and end dates (inclusive). */
  date: ISODate;
  completed: boolean;
}

/** One status change, kept forever (reopening or resuming never erases it). */
export interface StatusChange {
  /** `null` for the project's creation. */
  from: ProjectStatus | null;
  to: ProjectStatus;
  /** When the change was recorded. */
  at: ISODateTime;
  /** The business date the user gave (e.g. the day the project was completed). */
  effectiveDate: ISODate;
  reason: string | null;
}

/** Why and until when a project is postponed (`status: 'paused'`). */
export interface Postponement {
  reason: string;
  /** Expected date to resume work. */
  expectedResumeAt: ISODate | null;
  /** Revised finish date given by the user. Never replaces the planned `endDate`. */
  revisedFinish: ISODate | null;
}

/**
 * Lifecycle facts, separate from the plan (`startDate`/`endDate`) and from progress.
 * Changed only through the transitions in `features/projects/lib/lifecycle.ts`.
 */
export interface ProjectLifecycle {
  /** First day of actual work. */
  startedAt: ISODate | null;
  /** Set while `completed`. */
  completedAt: ISODate | null;
  /** Set while `cancelled` (closed without success). */
  closedAt: ISODate | null;
  /** Set while `cancelled`. */
  closeReason: string | null;
  /** Set while `paused`. */
  postponement: Postponement | null;
  /** Oldest first. */
  history: StatusChange[];
}

export interface Project {
  id: UUID;
  title: string;
  /** Plain text / simple markdown. */
  description: string;
  horizon: Horizon;
  /** Free-form grouping such as "Career", "Health" or "Finance". */
  category: string | null;
  status: ProjectStatus;
  color: ProjectColor;
  startDate: ISODate;
  /** Invariant: `endDate >= startDate`. */
  endDate: ISODate;
  /** Integer from 0 to 100. */
  progress: number;
  milestones: Milestone[];
  lifecycle: ProjectLifecycle;
  /** Manual ordering inside the horizon lane. */
  sortOrder: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Fields the user provides when creating a project. */
export type ProjectDraft = Omit<
  Project,
  'id' | 'createdAt' | 'updatedAt' | 'sortOrder' | 'lifecycle'
>;

/** Partial update applied to an existing project by the repository. */
export type ProjectPatch = Partial<ProjectDraft> & { lifecycle?: ProjectLifecycle };

/** What the editor may change directly: status goes through a lifecycle transition. */
export type ProjectFieldsPatch = Omit<ProjectPatch, 'status' | 'lifecycle'>;

/** Shape used for JSON export / import and for `localStorage`. */
export interface HorizonSnapshot {
  schemaVersion: 2;
  exportedAt: ISODateTime;
  projects: Project[];
}

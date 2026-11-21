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
  /** Manual ordering inside the horizon lane. */
  sortOrder: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Fields the user provides when creating a project. */
export type ProjectDraft = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>;

/** Partial update applied to an existing project. */
export type ProjectPatch = Partial<ProjectDraft>;

/** Shape used for JSON export / import and for `localStorage`. */
export interface HorizonSnapshot {
  schemaVersion: 1;
  exportedAt: ISODateTime;
  projects: Project[];
}

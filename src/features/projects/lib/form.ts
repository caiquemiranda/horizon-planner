import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

import type {
  Horizon,
  ISODate,
  Milestone,
  Project,
  ProjectColor,
  ProjectDraft,
  ProjectStatus,
} from '@/types/project';

import {
  DEFAULT_COLOR,
  DEFAULT_HORIZON,
  DEFAULT_STATUS,
  HORIZON_SUGGESTION_MAX_DAYS,
} from '../constants';
import { projectDraftSchema } from '../schemas';

/**
 * Editable state of the project form. Dates are plain strings because native date
 * inputs can be temporarily empty or incomplete while the user types.
 */
export interface ProjectFormValues {
  title: string;
  description: string;
  horizon: Horizon;
  status: ProjectStatus;
  category: string;
  color: ProjectColor;
  startDate: string;
  endDate: string;
  progress: number;
  milestones: MilestoneFormValues[];
}

export interface MilestoneFormValues {
  id: Milestone['id'];
  title: string;
  date: string;
  completed: boolean;
}

/** Error messages keyed by field path: `title`, `endDate`, `milestones.2.date`… */
export type FormErrors = Partial<Record<string, string>>;

export type FormValidation =
  | { success: true; draft: ProjectDraft; errors: FormErrors }
  | { success: false; errors: FormErrors };

/** Default length of a new project, in days. */
export const NEW_PROJECT_DURATION_DAYS = 30;

export function toFormValues(project: Project): ProjectFormValues {
  return {
    title: project.title,
    description: project.description,
    horizon: project.horizon,
    status: project.status,
    category: project.category ?? '',
    color: project.color,
    startDate: project.startDate,
    endDate: project.endDate,
    progress: project.progress,
    milestones: project.milestones.map((milestone) => ({ ...milestone })),
  };
}

export function createDefaultFormValues(today: ISODate): ProjectFormValues {
  const end = format(addDays(parseISO(today), NEW_PROJECT_DURATION_DAYS - 1), 'yyyy-MM-dd');
  return {
    title: '',
    description: '',
    horizon: suggestHorizon(today, end) ?? DEFAULT_HORIZON,
    status: DEFAULT_STATUS,
    category: '',
    color: DEFAULT_COLOR,
    startDate: today,
    endDate: end,
    progress: 0,
    milestones: [],
  };
}

/** Inclusive number of days between two `yyyy-MM-dd` dates, or `null` if either is invalid. */
export function countDays(startDate: string, endDate: string): number | null {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return differenceInCalendarDays(end, start) + 1;
}

/** Horizon that matches a date range (the user can always override it). */
export function suggestHorizon(startDate: string, endDate: string): Horizon | null {
  const days = countDays(startDate, endDate);
  if (days === null || days < 1) return null;
  if (days <= HORIZON_SUGGESTION_MAX_DAYS.short) return 'short';
  if (days <= HORIZON_SUGGESTION_MAX_DAYS.medium) return 'medium';
  return 'long';
}

function toErrorKey(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}

/**
 * Validates the form with the domain schema.
 * Date range errors are also checked by hand, because schema refinements only run
 * once every field is valid, and users should see them right away.
 */
export function validateForm(values: ProjectFormValues): FormValidation {
  const errors: FormErrors = {};

  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = 'A data de término deve ser igual ou posterior à data de início.';
  }

  const parsed = projectDraftSchema.safeParse({
    ...values,
    milestones: values.milestones.map((milestone) => ({ ...milestone })),
  });

  if (parsed.success && Object.keys(errors).length === 0) {
    return { success: true, draft: parsed.data, errors };
  }

  for (const issue of parsed.error?.issues ?? []) {
    const key = toErrorKey(issue.path);
    errors[key] ??= issue.message;
  }

  return { success: false, errors };
}

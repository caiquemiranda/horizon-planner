import { STATUS_META } from '@/features/projects/constants';
import type { Project } from '@/types/project';

/**
 * Who may change a project's schedule. The single place that decides it: the workspace
 * store refuses every command when `canEdit` is false, and the UI only reflects it.
 *
 * The product has no user accounts yet, so the rule is about the project itself: a closed
 * project (completed or cancelled) keeps its plan as a record and opens read-only. When
 * authentication exists, the user's role on the project joins this function.
 */
export interface ScheduleAccess {
  canEdit: boolean;
  /** Why editing is off, with the next action, in pt-BR. */
  reason: string | null;
}

export const FULL_ACCESS: ScheduleAccess = { canEdit: true, reason: null };

export function getScheduleAccess(project: Pick<Project, 'status'>): ScheduleAccess {
  if (STATUS_META[project.status].isClosed) {
    return {
      canEdit: false,
      reason: `Projeto ${STATUS_META[project.status].label.toLowerCase()}: o cronograma está somente para leitura. Para editar, mude o status do projeto no portfólio.`,
    };
  }
  return FULL_ACCESS;
}

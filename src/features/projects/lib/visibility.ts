import type { Project } from '@/types/project';

/**
 * Where a project is listed. Visibility and the trash are separate from the lifecycle:
 * hiding or trashing never changes the status, dates, progress or schedule.
 *
 * Precedence: a trashed project is in the trash even when it is also hidden; otherwise a
 * hidden project is in "Ocultos"; otherwise it is listed normally. Restoring from the
 * trash keeps the hidden flag, so a hidden project goes back to "Ocultos".
 */
export type ProjectPlacement = 'listed' | 'hidden' | 'trash';

export function getPlacement(project: Pick<Project, 'hiddenAt' | 'deletedAt'>): ProjectPlacement {
  if (project.deletedAt !== null) return 'trash';
  if (project.hiddenAt !== null) return 'hidden';
  return 'listed';
}

/** Projects of one placement, in their original order. */
export function selectByPlacement(
  projects: readonly Project[],
  placement: ProjectPlacement,
): Project[] {
  return projects.filter((project) => getPlacement(project) === placement);
}

/** Projects that still exist for the user (everything but the trash). */
export function selectNotTrashed(projects: readonly Project[]): Project[] {
  return projects.filter((project) => project.deletedAt === null);
}

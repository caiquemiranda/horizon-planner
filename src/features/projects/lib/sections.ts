import type { Project, ProjectStatus } from '@/types/project';

import { getPlacement } from './visibility';

/**
 * Navigation sections of the portfolio. Each one is a fixed rule over status and
 * placement, shared by the lists and their counts so both always agree:
 *
 * | Section         | Rule                                              |
 * | --------------- | ------------------------------------------------- |
 * | Todos           | visible (not hidden, not in the trash)            |
 * | Ativos          | visible and planned or in progress                |
 * | Adiados         | visible and postponed                             |
 * | Não concluídos  | visible and closed without success                |
 * | Concluídos      | visible and completed                             |
 * | Ocultos         | hidden and not in the trash, any status           |
 * | Lixeira         | in the trash, any status or visibility            |
 *
 * Ativos, Adiados, Não concluídos and Concluídos never overlap, and together they make
 * Todos. Postponed projects are not counted as active: postponing is a decision to stop.
 */
export const PROJECT_SECTIONS = [
  'all',
  'active',
  'postponed',
  'not_completed',
  'completed',
  'hidden',
  'trash',
] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

/** Sections drawn on the timeline (the others have their own list page). */
export type TimelineSection = Exclude<ProjectSection, 'hidden' | 'trash'>;

const STATUSES_BY_SECTION: Record<Exclude<TimelineSection, 'all'>, readonly ProjectStatus[]> = {
  active: ['planned', 'in_progress'],
  postponed: ['paused'],
  not_completed: ['cancelled'],
  completed: ['completed'],
};

export function isInSection(project: Project, section: ProjectSection): boolean {
  const placement = getPlacement(project);
  if (section === 'trash') return placement === 'trash';
  if (section === 'hidden') return placement === 'hidden';
  if (placement !== 'listed') return false;
  if (section === 'all') return true;
  return STATUSES_BY_SECTION[section].includes(project.status);
}

export function selectSection(projects: readonly Project[], section: ProjectSection): Project[] {
  return projects.filter((project) => isInSection(project, section));
}

export function countSections(projects: readonly Project[]): Record<ProjectSection, number> {
  const counts = Object.fromEntries(PROJECT_SECTIONS.map((section) => [section, 0])) as Record<
    ProjectSection,
    number
  >;
  for (const project of projects) {
    for (const section of PROJECT_SECTIONS) {
      if (isInSection(project, section)) counts[section] += 1;
    }
  }
  return counts;
}

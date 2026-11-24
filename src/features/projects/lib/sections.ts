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

/** Lowercase without accents, so "acao" finds "Ação". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/** Projects by title, as people look for them in a list. */
export function sortByTitle(projects: readonly Project[]): Project[] {
  return [...projects].sort((a, b) =>
    a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }),
  );
}

/**
 * Finds projects by title, ignoring case and accents, in every section (hidden and
 * trashed ones included, so nothing is out of reach). Titles starting with the query come
 * first. An empty query finds nothing.
 */
export function searchProjects(projects: readonly Project[], query: string): Project[] {
  const needle = normalize(query);
  if (needle === '') return [];
  const matches = projects.filter((project) => normalize(project.title).includes(needle));
  const starts = matches.filter((project) => normalize(project.title).startsWith(needle));
  const contains = matches.filter((project) => !normalize(project.title).startsWith(needle));
  return [...sortByTitle(starts), ...sortByTitle(contains)];
}

/** The section a project is listed in: its status section, or hidden, or the trash. */
export function getHomeSection(project: Project): Exclude<ProjectSection, 'all'> {
  for (const section of [
    'trash',
    'hidden',
    'active',
    'postponed',
    'not_completed',
    'completed',
  ] as const) {
    if (isInSection(project, section)) return section;
  }
  return 'active';
}

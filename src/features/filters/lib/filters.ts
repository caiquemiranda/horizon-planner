import {
  type Horizon,
  HORIZONS,
  type Project,
  PROJECT_STATUSES,
  type ProjectStatus,
  type UUID,
} from '@/types/project';

/** Projects without a category are filtered with this key. */
export const NO_CATEGORY = null;
export type CategoryKey = string | typeof NO_CATEGORY;

/**
 * Active filters. Inside a dimension values are OR-ed, across dimensions AND-ed.
 * An empty list means the dimension is not filtered.
 */
export interface ProjectFilters {
  horizons: readonly Horizon[];
  statuses: readonly ProjectStatus[];
  categories: readonly CategoryKey[];
}

export type FilterDimension = keyof ProjectFilters;

export const EMPTY_FILTERS: ProjectFilters = { horizons: [], statuses: [], categories: [] };

function matchesDimension(
  project: Project,
  filters: ProjectFilters,
  dimension: FilterDimension,
): boolean {
  switch (dimension) {
    case 'horizons':
      return filters.horizons.length === 0 || filters.horizons.includes(project.horizon);
    case 'statuses':
      return filters.statuses.length === 0 || filters.statuses.includes(project.status);
    case 'categories':
      return filters.categories.length === 0 || filters.categories.includes(project.category);
  }
}

const DIMENSIONS: readonly FilterDimension[] = ['horizons', 'statuses', 'categories'];

/** Whether the project passes every dimension except `ignore` (used for facet counts). */
export function matchesFilters(
  project: Project,
  filters: ProjectFilters,
  ignore?: FilterDimension,
): boolean {
  return DIMENSIONS.every(
    (dimension) => dimension === ignore || matchesDimension(project, filters, dimension),
  );
}

export function isFiltering(filters: ProjectFilters): boolean {
  return DIMENSIONS.some((dimension) => filters[dimension].length > 0);
}

/** Number of selected values across all dimensions, for the toolbar badge. */
export function countActiveFilters(filters: ProjectFilters): number {
  return DIMENSIONS.reduce((total, dimension) => total + filters[dimension].length, 0);
}

export interface FilterResult {
  /** Projects to display: the matches plus the kept project, if any. */
  projects: Project[];
  /** Projects that actually match the filters. */
  matchCount: number;
}

/**
 * Applies the filters. `keepId` stays visible even when it no longer matches, so a
 * project being edited does not vanish from under the user.
 */
export function filterProjects(
  projects: readonly Project[],
  filters: ProjectFilters,
  keepId: UUID | null = null,
): FilterResult {
  let matchCount = 0;
  const visible = projects.filter((project) => {
    const matches = matchesFilters(project, filters);
    if (matches) matchCount += 1;
    return matches || project.id === keepId;
  });
  return { projects: visible, matchCount };
}

/** Lanes to show: all of them unless the horizon dimension is filtered. */
export function getVisibleHorizons(filters: ProjectFilters): readonly Horizon[] {
  return filters.horizons.length === 0
    ? HORIZONS
    : HORIZONS.filter((horizon) => filters.horizons.includes(horizon));
}

/** Adds the value when missing, removes it otherwise. */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export interface FacetOption<T> {
  value: T;
  /** Projects that would match if this value were selected, given the other dimensions. */
  count: number;
}

function countFacet<T>(
  projects: readonly Project[],
  filters: ProjectFilters,
  dimension: FilterDimension,
  values: readonly T[],
  read: (project: Project) => T,
): FacetOption<T>[] {
  const counts = new Map<T, number>(values.map((value) => [value, 0]));
  for (const project of projects) {
    if (!matchesFilters(project, filters, dimension)) continue;
    const value = read(project);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return values.map((value) => ({ value, count: counts.get(value) ?? 0 }));
}

export interface FilterFacets {
  horizons: FacetOption<Horizon>[];
  statuses: FacetOption<ProjectStatus>[];
  /** Named categories sorted alphabetically, then "no category" when any project lacks one. */
  categories: FacetOption<CategoryKey>[];
}

/**
 * Options and counts for each dimension. Categories come from the projects, and
 * selected categories stay listed even if no project uses them anymore.
 */
export function getFilterFacets(
  projects: readonly Project[],
  filters: ProjectFilters,
): FilterFacets {
  const named = new Set<string>();
  let hasUncategorized = false;
  for (const project of projects) {
    if (project.category === null) hasUncategorized = true;
    else named.add(project.category);
  }
  for (const category of filters.categories) {
    if (category === NO_CATEGORY) hasUncategorized = true;
    else named.add(category);
  }

  const categories: CategoryKey[] = [...named].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (hasUncategorized) categories.push(NO_CATEGORY);

  return {
    horizons: countFacet(projects, filters, 'horizons', HORIZONS, (project) => project.horizon),
    statuses: countFacet(
      projects,
      filters,
      'statuses',
      PROJECT_STATUSES,
      (project) => project.status,
    ),
    categories: countFacet(
      projects,
      filters,
      'categories',
      categories,
      (project) => project.category,
    ),
  };
}

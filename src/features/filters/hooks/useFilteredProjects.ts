import { useMemo } from 'react';

import { type Horizon, HORIZONS, type Project, type UUID } from '@/types/project';

import { filterProjects, getVisibleHorizons } from '../lib/filters';
import { useFiltersStore } from '../store/filtersStore';

export interface FilteredProjects {
  /** Projects to draw on the timeline. */
  projects: Project[];
  /** Lanes to draw, stable between renders. */
  horizons: readonly Horizon[];
  matchCount: number;
}

/**
 * Applies the active filters. The project open in the drawer (`keepId`) stays on the
 * timeline, lane included, so editing it never makes it disappear.
 */
export function useFilteredProjects(
  projects: readonly Project[],
  keepId: UUID | null,
): FilteredProjects {
  const filters = useFiltersStore((state) => state.filters);

  const result = useMemo(
    () => filterProjects(projects, filters, keepId),
    [projects, filters, keepId],
  );

  const keptHorizon = keepId
    ? projects.find((project) => project.id === keepId)?.horizon
    : undefined;
  const horizons = useMemo(() => {
    const visible = getVisibleHorizons(filters);
    if (!keptHorizon || visible.includes(keptHorizon)) return visible;
    return HORIZONS.filter((horizon) => horizon === keptHorizon || visible.includes(horizon));
  }, [filters, keptHorizon]);

  return {
    projects: result.projects,
    horizons,
    matchCount: result.matchCount,
  };
}

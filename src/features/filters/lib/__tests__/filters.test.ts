import { describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';

import {
  countActiveFilters,
  EMPTY_FILTERS,
  filterProjects,
  getFilterFacets,
  getVisibleHorizons,
  isFiltering,
  matchesFilters,
  NO_CATEGORY,
  type ProjectFilters,
  toggleValue,
} from '../filters';

const career = makeProject({ horizon: 'short', status: 'in_progress', category: 'Carreira' });
const health = makeProject({ horizon: 'medium', status: 'planned', category: 'Saúde' });
const house = makeProject({ horizon: 'long', status: 'planned', category: null });
const course = makeProject({ horizon: 'short', status: 'completed', category: 'Carreira' });
const projects = [career, health, house, course];

function filters(overrides: Partial<ProjectFilters>): ProjectFilters {
  return { ...EMPTY_FILTERS, ...overrides };
}

describe('matchesFilters', () => {
  it('matches everything without filters', () => {
    expect(projects.every((project) => matchesFilters(project, EMPTY_FILTERS))).toBe(true);
  });

  it('ORs values inside a dimension and ANDs across dimensions', () => {
    const active = filters({ horizons: ['short', 'medium'], statuses: ['planned'] });

    expect(projects.filter((project) => matchesFilters(project, active))).toEqual([health]);
  });

  it('matches projects without a category with the "no category" key', () => {
    const active = filters({ categories: [NO_CATEGORY] });

    expect(projects.filter((project) => matchesFilters(project, active))).toEqual([house]);
  });

  it('can ignore one dimension', () => {
    const active = filters({ horizons: ['long'], statuses: ['completed'] });

    expect(matchesFilters(course, active)).toBe(false);
    expect(matchesFilters(course, active, 'horizons')).toBe(true);
  });
});

describe('filterProjects', () => {
  it('returns the matches and their count', () => {
    const result = filterProjects(projects, filters({ categories: ['Carreira'] }));

    expect(result).toEqual({ projects: [career, course], matchCount: 2 });
  });

  it('keeps the given project visible without counting it as a match', () => {
    const result = filterProjects(projects, filters({ statuses: ['completed'] }), career.id);

    expect(result.projects).toEqual([career, course]);
    expect(result.matchCount).toBe(1);
  });
});

describe('active filters', () => {
  it('reports whether anything is filtered and how many values are selected', () => {
    expect(isFiltering(EMPTY_FILTERS)).toBe(false);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);

    const active = filters({ horizons: ['short'], categories: ['Saúde', NO_CATEGORY] });
    expect(isFiltering(active)).toBe(true);
    expect(countActiveFilters(active)).toBe(3);
  });

  it('shows every lane unless horizons are filtered', () => {
    expect(getVisibleHorizons(EMPTY_FILTERS)).toEqual(['short', 'medium', 'long']);
    expect(getVisibleHorizons(filters({ horizons: ['long', 'short'] }))).toEqual(['short', 'long']);
  });
});

describe('toggleValue', () => {
  it('adds and removes values', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleValue([null], null)).toEqual([]);
  });
});

describe('getFilterFacets', () => {
  it('lists categories alphabetically with "no category" last', () => {
    const facets = getFilterFacets(projects, EMPTY_FILTERS);

    expect(facets.categories).toEqual([
      { value: 'Carreira', count: 2 },
      { value: 'Saúde', count: 1 },
      { value: NO_CATEGORY, count: 1 },
    ]);
  });

  it('omits "no category" when every project has one', () => {
    const facets = getFilterFacets([career, health], EMPTY_FILTERS);

    expect(facets.categories.map((option) => option.value)).toEqual(['Carreira', 'Saúde']);
  });

  it('counts each dimension against the other active dimensions', () => {
    const facets = getFilterFacets(projects, filters({ horizons: ['short'] }));

    // Horizon counts ignore the horizon filter itself...
    expect(facets.horizons).toEqual([
      { value: 'short', count: 2 },
      { value: 'medium', count: 1 },
      { value: 'long', count: 1 },
    ]);
    // ...while the other dimensions only count short-term projects.
    expect(facets.statuses).toEqual([
      { value: 'planned', count: 0 },
      { value: 'in_progress', count: 1 },
      { value: 'paused', count: 0 },
      { value: 'completed', count: 1 },
      { value: 'cancelled', count: 0 },
    ]);
  });

  it('keeps selected categories listed after their projects are gone', () => {
    const facets = getFilterFacets([health], filters({ categories: ['Carreira'] }));

    expect(facets.categories).toEqual([
      { value: 'Carreira', count: 0 },
      { value: 'Saúde', count: 1 },
    ]);
  });
});

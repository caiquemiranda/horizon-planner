import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';
import { HORIZONS } from '@/types/project';

import { useFiltersStore } from '../../store/filtersStore';
import { useFilteredProjects } from '../useFilteredProjects';

const short = makeProject({ horizon: 'short' });
const medium = makeProject({ horizon: 'medium' });
const long = makeProject({ horizon: 'long' });
const projects = [short, medium, long];

describe('useFilteredProjects', () => {
  beforeEach(() => {
    useFiltersStore.getState().clearAll();
  });

  it('shows everything without filters', () => {
    const { result } = renderHook(() => useFilteredProjects(projects, null));

    expect(result.current).toEqual({ projects, horizons: HORIZONS, matchCount: 3 });
  });

  it('keeps the lane of the kept project when its horizon is filtered out', () => {
    act(() => {
      useFiltersStore.getState().toggleHorizon('long');
    });

    const { result } = renderHook(() => useFilteredProjects(projects, short.id));

    expect(result.current.projects).toEqual([short, long]);
    expect(result.current.horizons).toEqual(['short', 'long']);
    expect(result.current.matchCount).toBe(1);
  });

  it('returns stable lanes between renders', () => {
    act(() => {
      useFiltersStore.getState().toggleHorizon('medium');
    });
    const { result, rerender } = renderHook(() => useFilteredProjects(projects, null));
    const first = result.current.horizons;

    rerender();

    expect(result.current.horizons).toBe(first);
  });
});

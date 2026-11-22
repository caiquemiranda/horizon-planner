import { create } from 'zustand';

import type { Horizon, ProjectStatus } from '@/types/project';

import {
  type CategoryKey,
  EMPTY_FILTERS,
  type FilterDimension,
  type ProjectFilters,
  toggleValue,
} from '../lib/filters';

interface FiltersState {
  filters: ProjectFilters;
  toggleHorizon: (horizon: Horizon) => void;
  toggleStatus: (status: ProjectStatus) => void;
  toggleCategory: (category: CategoryKey) => void;
  clearDimension: (dimension: FilterDimension) => void;
  clearAll: () => void;
}

/** Filters for the current session (kept in memory on purpose: a reload shows everything). */
export const useFiltersStore = create<FiltersState>()((set) => ({
  filters: EMPTY_FILTERS,
  toggleHorizon: (horizon) => {
    set(({ filters }) => ({
      filters: { ...filters, horizons: toggleValue(filters.horizons, horizon) },
    }));
  },
  toggleStatus: (status) => {
    set(({ filters }) => ({
      filters: { ...filters, statuses: toggleValue(filters.statuses, status) },
    }));
  },
  toggleCategory: (category) => {
    set(({ filters }) => ({
      filters: { ...filters, categories: toggleValue(filters.categories, category) },
    }));
  },
  clearDimension: (dimension) => {
    set(({ filters }) => ({ filters: { ...filters, [dimension]: [] } }));
  },
  clearAll: () => {
    set({ filters: EMPTY_FILTERS });
  },
}));

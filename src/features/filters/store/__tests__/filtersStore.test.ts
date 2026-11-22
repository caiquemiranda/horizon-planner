import { beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, NO_CATEGORY } from '../../lib/filters';
import { useFiltersStore } from '../filtersStore';

describe('filtersStore', () => {
  beforeEach(() => {
    useFiltersStore.getState().clearAll();
  });

  it('toggles values in each dimension', () => {
    const { toggleHorizon, toggleStatus, toggleCategory } = useFiltersStore.getState();

    toggleHorizon('short');
    toggleStatus('paused');
    toggleCategory('Saúde');
    toggleCategory(NO_CATEGORY);
    toggleHorizon('short');

    expect(useFiltersStore.getState().filters).toEqual({
      horizons: [],
      statuses: ['paused'],
      categories: ['Saúde', NO_CATEGORY],
    });
  });

  it('clears one dimension or everything', () => {
    const { toggleHorizon, toggleStatus, clearDimension, clearAll } = useFiltersStore.getState();
    toggleHorizon('long');
    toggleStatus('planned');

    clearDimension('horizons');
    expect(useFiltersStore.getState().filters).toEqual({
      ...EMPTY_FILTERS,
      statuses: ['planned'],
    });

    clearAll();
    expect(useFiltersStore.getState().filters).toEqual(EMPTY_FILTERS);
  });
});

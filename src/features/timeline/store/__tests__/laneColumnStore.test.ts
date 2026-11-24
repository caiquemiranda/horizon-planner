import { describe, expect, it } from 'vitest';

import { MemoryStorage } from '@/services/persistence/__tests__/helpers';

import { createLaneColumnStore, LANE_COLUMN_STORAGE_KEY } from '../laneColumnStore';

describe('laneColumnStore', () => {
  it('starts compact (the sidebar lists the projects), remembers the choice and reads it back', () => {
    const storage = new MemoryStorage();
    const store = createLaneColumnStore(storage);
    expect(store.getState().compact).toBe(true);
    store.getState().toggleCompact();
    expect(store.getState().compact).toBe(false);
    expect(storage.getItem(LANE_COLUMN_STORAGE_KEY)).toBe('full');
    expect(createLaneColumnStore(storage).getState().compact).toBe(false);
  });

  it('works without storage', () => {
    const store = createLaneColumnStore(null);
    expect(store.getState().compact).toBe(true);
    store.getState().toggleCompact();
    expect(store.getState().compact).toBe(false);
  });
});

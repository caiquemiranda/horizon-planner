import { describe, expect, it } from 'vitest';

import { MemoryStorage } from '@/services/persistence/__tests__/helpers';

import { createLaneColumnStore, LANE_COLUMN_STORAGE_KEY } from '../laneColumnStore';

describe('laneColumnStore', () => {
  it('starts full, remembers the choice and reads it back', () => {
    const storage = new MemoryStorage();
    const store = createLaneColumnStore(storage);
    expect(store.getState().compact).toBe(false);
    store.getState().toggleCompact();
    expect(store.getState().compact).toBe(true);
    expect(storage.getItem(LANE_COLUMN_STORAGE_KEY)).toBe('compact');
    expect(createLaneColumnStore(storage).getState().compact).toBe(true);
  });

  it('works without storage', () => {
    const store = createLaneColumnStore(null);
    store.getState().toggleCompact();
    expect(store.getState().compact).toBe(true);
  });
});

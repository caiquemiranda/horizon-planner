import { describe, expect, it } from 'vitest';

import { MemoryStorage } from '@/services/persistence/__tests__/helpers';

import { createWorkspaceUiStore, WORKSPACE_PREFS_PREFIX } from '../workspaceUiStore';

describe('workspaceUiStore', () => {
  it('remembers collapsed tasks per project', () => {
    const storage = new MemoryStorage();
    const store = createWorkspaceUiStore(storage);
    store.getState().load('p1');
    store.getState().toggle('phase-1');
    store.getState().load('p2');
    expect(store.getState().collapsedIds.size).toBe(0);

    const reopened = createWorkspaceUiStore(storage);
    reopened.getState().load('p1');
    expect([...reopened.getState().collapsedIds]).toEqual(['phase-1']);
  });

  it('expands and collapses everything', () => {
    const store = createWorkspaceUiStore(new MemoryStorage());
    store.getState().load('p1');
    store.getState().collapseAll(['a', 'b']);
    expect(store.getState().collapsedIds).toEqual(new Set(['a', 'b']));
    store.getState().expandAll();
    expect(store.getState().collapsedIds.size).toBe(0);
  });

  it('resets selection and filter when opening another project', () => {
    const store = createWorkspaceUiStore(new MemoryStorage());
    store.getState().load('p1');
    store.getState().select('task');
    store.getState().setFilterText('abc');
    store.getState().load('p2');
    expect(store.getState()).toMatchObject({ selectedId: null, filterText: '', projectId: 'p2' });
  });

  it('survives broken or unavailable storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${WORKSPACE_PREFS_PREFIX}p1`, '{ broken');
    const store = createWorkspaceUiStore(storage);
    store.getState().load('p1');
    expect(store.getState().collapsedIds.size).toBe(0);

    storage.failOnSet = new Error('blocked');
    expect(() => {
      store.getState().toggle('a');
    }).not.toThrow();

    const noStorage = createWorkspaceUiStore(null);
    noStorage.getState().load('p1');
    noStorage.getState().toggle('a');
    expect(noStorage.getState().collapsedIds.has('a')).toBe(true);
  });
});

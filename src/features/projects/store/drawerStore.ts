import { create } from 'zustand';

import type { UUID } from '@/types/project';

export type DrawerView =
  { mode: 'closed' } | { mode: 'edit'; projectId: UUID } | { mode: 'create' };

interface DrawerState {
  view: DrawerView;
  /** Project shown in the expanded dialog over the current page (the route does not change). */
  expandedProjectId: UUID | null;
  expand: (projectId: UUID) => void;
  closeExpanded: () => void;
  openProject: (projectId: UUID) => void;
  openCreate: () => void;
  close: () => void;
}

/** Which project the side drawer shows (UI state, not persisted). */
export const useDrawerStore = create<DrawerState>()((set) => ({
  view: { mode: 'closed' },
  expandedProjectId: null,
  expand: (projectId) => {
    set({ expandedProjectId: projectId });
  },
  closeExpanded: () => {
    set({ expandedProjectId: null });
  },
  openProject: (projectId) => {
    set({ view: { mode: 'edit', projectId } });
  },
  openCreate: () => {
    set({ view: { mode: 'create' } });
  },
  close: () => {
    set({ view: { mode: 'closed' } });
  },
}));

/** Id of the project being edited, or `null`. */
export function selectEditingProjectId(state: { view: DrawerView }): UUID | null {
  return state.view.mode === 'edit' ? state.view.projectId : null;
}

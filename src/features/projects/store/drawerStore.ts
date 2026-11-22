import { create } from 'zustand';

import type { UUID } from '@/types/project';

export type DrawerView =
  { mode: 'closed' } | { mode: 'edit'; projectId: UUID } | { mode: 'create' };

interface DrawerState {
  view: DrawerView;
  openProject: (projectId: UUID) => void;
  openCreate: () => void;
  close: () => void;
}

/** Which project the side drawer shows (UI state, not persisted). */
export const useDrawerStore = create<DrawerState>()((set) => ({
  view: { mode: 'closed' },
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

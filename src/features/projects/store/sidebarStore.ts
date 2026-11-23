import { create, type StoreApi, type UseBoundStore } from 'zustand';

/** Browser preference, per device: a narrow laptop and a wide monitor may differ. */
export const SIDEBAR_STORAGE_KEY = 'horizon-planner:sidebar';

interface SidebarState {
  /** Rail with icons only, so the timeline gets the width back. */
  collapsed: boolean;
  /** The phone drawer (below the `md` breakpoint the rail is not shown). */
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
}

export type SidebarStore = UseBoundStore<StoreApi<SidebarState>>;

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCollapsed(storage: Storage | null): boolean {
  try {
    return storage?.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function createSidebarStore(storage: Storage | null = getStorage()): SidebarStore {
  return create<SidebarState>()((set, get) => ({
    collapsed: readCollapsed(storage),
    mobileOpen: false,
    toggleCollapsed: () => {
      const collapsed = !get().collapsed;
      set({ collapsed });
      try {
        storage?.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
      } catch {
        // A convenience: failing to remember it must not block navigation.
      }
    },
    setMobileOpen: (mobileOpen) => {
      set({ mobileOpen });
    },
  }));
}

export const useSidebarStore = createSidebarStore();

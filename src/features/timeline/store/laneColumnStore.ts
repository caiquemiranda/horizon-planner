import { create, type StoreApi, type UseBoundStore } from 'zustand';

/**
 * Browser preference: the timeline's horizon column shown in full or as a narrow strip.
 * Compact by default: the sidebar explorer already lists the projects by horizon, so the
 * full column would repeat it.
 */
export const LANE_COLUMN_STORAGE_KEY = 'horizon-planner:lane-column';

interface LaneColumnState {
  /** Narrow strip: horizon markers and project dots, names in tooltips. */
  compact: boolean;
  toggleCompact: () => void;
}

export type LaneColumnStore = UseBoundStore<StoreApi<LaneColumnState>>;

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createLaneColumnStore(storage: Storage | null = getStorage()): LaneColumnStore {
  let compact = true;
  try {
    compact = storage?.getItem(LANE_COLUMN_STORAGE_KEY) !== 'full';
  } catch {
    // Unreadable storage: start compact.
  }
  return create<LaneColumnState>()((set, get) => ({
    compact,
    toggleCompact: () => {
      const next = !get().compact;
      set({ compact: next });
      try {
        storage?.setItem(LANE_COLUMN_STORAGE_KEY, next ? 'compact' : 'full');
      } catch {
        // A convenience: failing to remember it must not block the timeline.
      }
    },
  }));
}

export const useLaneColumnStore = createLaneColumnStore();

import { create, type StoreApi, type UseBoundStore } from 'zustand';

import type { UUID } from '@/types/project';

/**
 * Presentation state of the workspace: which summaries are collapsed, which task is
 * selected and the text filter. It never changes the schedule: collapsing a phase hides
 * rows, it does not touch dates, links or the hierarchy.
 *
 * Collapsed ids (not expanded ones) are remembered per project, so new tasks start
 * expanded and the choice survives reloads. Selection and filter are per visit.
 */

export const WORKSPACE_PREFS_PREFIX = 'horizon-planner:workspace:';

interface StoredPrefs {
  collapsedIds: UUID[];
  /** Width of the table pane, in px. */
  splitWidth?: number;
}

export const DEFAULT_SPLIT_WIDTH = 620;

export interface WorkspaceUiState {
  projectId: UUID | null;
  collapsedIds: ReadonlySet<UUID>;
  selectedId: UUID | null;
  /** Row under the pointer, highlighted in both panes. */
  hoveredId: UUID | null;
  splitWidth: number;
  filterText: string;

  /** Resets the state for a project and restores its saved preferences. */
  load: (projectId: UUID) => void;
  setCollapsed: (id: UUID, collapsed: boolean) => void;
  toggle: (id: UUID) => void;
  expandAll: () => void;
  collapseAll: (summaryIds: readonly UUID[]) => void;
  select: (id: UUID | null) => void;
  setHovered: (id: UUID | null) => void;
  setSplitWidth: (width: number) => void;
  setFilterText: (text: string) => void;
}

export type WorkspaceUiStore = UseBoundStore<StoreApi<WorkspaceUiState>>;

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPrefs(storage: Storage | null, projectId: UUID): StoredPrefs {
  try {
    const raw = storage?.getItem(WORKSPACE_PREFS_PREFIX + projectId);
    if (!raw) return { collapsedIds: [] };
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      collapsedIds: Array.isArray(parsed.collapsedIds)
        ? parsed.collapsedIds.filter((id): id is UUID => typeof id === 'string')
        : [],
      ...(typeof parsed.splitWidth === 'number' && Number.isFinite(parsed.splitWidth)
        ? { splitWidth: parsed.splitWidth }
        : {}),
    };
  } catch {
    return { collapsedIds: [] };
  }
}

function writePrefs(storage: Storage | null, projectId: UUID, prefs: StoredPrefs) {
  try {
    storage?.setItem(WORKSPACE_PREFS_PREFIX + projectId, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience: failing to save them must not disturb editing.
  }
}

export function createWorkspaceUiStore(storage: Storage | null = getStorage()): WorkspaceUiStore {
  return create<WorkspaceUiState>()((set, get) => {
    const save = () => {
      const { projectId, collapsedIds, splitWidth } = get();
      if (projectId)
        writePrefs(storage, projectId, { collapsedIds: [...collapsedIds], splitWidth });
    };
    const setCollapsedIds = (collapsedIds: ReadonlySet<UUID>) => {
      set({ collapsedIds });
      save();
    };

    return {
      projectId: null,
      collapsedIds: new Set(),
      selectedId: null,
      hoveredId: null,
      splitWidth: DEFAULT_SPLIT_WIDTH,
      filterText: '',

      load: (projectId) => {
        const prefs = readPrefs(storage, projectId);
        set({
          projectId,
          collapsedIds: new Set(prefs.collapsedIds),
          selectedId: null,
          hoveredId: null,
          splitWidth: prefs.splitWidth ?? DEFAULT_SPLIT_WIDTH,
          filterText: '',
        });
      },
      setCollapsed: (id, collapsed) => {
        const next = new Set(get().collapsedIds);
        if (collapsed) next.add(id);
        else next.delete(id);
        setCollapsedIds(next);
      },
      toggle: (id) => {
        get().setCollapsed(id, !get().collapsedIds.has(id));
      },
      expandAll: () => {
        setCollapsedIds(new Set());
      },
      collapseAll: (summaryIds) => {
        setCollapsedIds(new Set(summaryIds));
      },
      select: (id) => {
        if (get().selectedId !== id) set({ selectedId: id });
      },
      setHovered: (id) => {
        if (get().hoveredId !== id) set({ hoveredId: id });
      },
      setSplitWidth: (width) => {
        set({ splitWidth: Math.round(width) });
        save();
      },
      setFilterText: (filterText) => {
        set({ filterText });
      },
    };
  });
}

export const useWorkspaceUiStore = createWorkspaceUiStore();

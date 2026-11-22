import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { createId } from '@/lib/id';
import {
  PersistenceError,
  ProjectValidationError,
  ScheduleConflictError,
  type ScheduleRepository,
} from '@/services/persistence';
import type { UUID } from '@/types/project';
import type { ProjectSchedule, ScheduleResult } from '@/types/schedule';

import { computeSchedule } from '../lib/engine';
import { ScheduleRuleError } from '../lib/errors';
import { createEmptySchedule } from '../lib/fixtures';

/**
 * Workspace state for the open project: its schedule, the engine result and the saving
 * status. The single source of truth shared by the TreeGrid and the Gantt.
 *
 * - Every change goes through `apply(command)`, where `command` is a pure domain command
 *   (`lib/commands`). Rule violations are returned as messages and change nothing.
 * - Changes show at once and are saved in the background, one write at a time; the
 *   latest local state always wins over older save responses.
 * - Saves use the stored revision: an edit made in another tab is detected as a conflict
 *   instead of being overwritten.
 * - Loads carry a token, so a slow response for a project the user already left is
 *   ignored.
 */

export type WorkspaceLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

export type ScheduleCommand = (schedule: ProjectSchedule) => ProjectSchedule;

export type ApplyResult = { ok: true } | { ok: false; error: string };

export interface ScheduleState {
  projectId: UUID | null;
  status: WorkspaceLoadStatus;
  loadError: string | null;
  schedule: ProjectSchedule | null;
  result: ScheduleResult | null;
  saveStatus: SaveStatus;
  saveError: string | null;

  /** Loads a project's schedule (an empty one if it was never planned). */
  open: (projectId: UUID) => Promise<void>;
  /** Leaves the workspace; pending saves still complete. */
  close: () => void;
  /** Applies a domain command, recomputes the schedule and saves it. */
  apply: (command: ScheduleCommand) => ApplyResult;
  /** Tries the last failed save again. */
  retrySave: () => Promise<void>;
  /** Conflict: drop local changes and load what is stored. */
  reload: () => Promise<void>;
  /** Conflict: keep local changes and write them over the stored version. */
  overwrite: () => Promise<void>;
}

export interface ScheduleStoreOptions {
  now?: () => Date;
  /** Called after every successful save (e.g. to update the portfolio project). */
  onSaved?: (schedule: ProjectSchedule, result: ScheduleResult) => void;
}

export type ScheduleStore = UseBoundStore<StoreApi<ScheduleState>>;

/** Short pt-BR message for persistence failures. */
export function describeSaveError(error: unknown): string {
  if (error instanceof ScheduleConflictError) return error.message;
  if (error instanceof PersistenceError && error.reason === 'quota-exceeded') {
    return 'Não há espaço suficiente no armazenamento do navegador.';
  }
  if (error instanceof ProjectValidationError) {
    return `O cronograma não pôde ser salvo: ${error.message}`;
  }
  return 'Não foi possível salvar o cronograma. Verifique o armazenamento e tente novamente.';
}

export function createScheduleStore(
  repository: ScheduleRepository,
  { now = () => new Date(), onSaved }: ScheduleStoreOptions = {},
): ScheduleStore {
  return create<ScheduleState>()((set, get) => {
    /** Incremented on every open/close; stale async results compare against it. */
    let session = 0;
    /** Revision of the last version known to be stored (base for the next save). */
    let baseRevision = 0;
    let saving: Promise<void> | null = null;
    /** Local changes not yet written. */
    let dirty = false;
    let unsubscribe: (() => void) | null = null;

    const isCurrent = (token: number, projectId: UUID) =>
      token === session && get().projectId === projectId;

    const writeLoop = async (token: number, projectId: UUID, force = false) => {
      let overwrite = force;
      while (dirty && isCurrent(token, projectId)) {
        const snapshot = get().schedule;
        if (!snapshot) return;
        dirty = false;
        set({ saveStatus: 'saving', saveError: null });
        try {
          if (overwrite) {
            baseRevision = (await repository.get(projectId))?.revision ?? 0;
            overwrite = false;
          }
          const saved = await repository.save(snapshot, baseRevision);
          if (!isCurrent(token, projectId)) return;
          baseRevision = saved.revision;
          // Keep edits made while saving; only take the stored metadata.
          set((state) => ({
            schedule: state.schedule
              ? { ...state.schedule, revision: saved.revision, updatedAt: saved.updatedAt }
              : state.schedule,
          }));
          const { result } = get();
          if (result) onSaved?.(saved, result);
        } catch (error) {
          if (!isCurrent(token, projectId)) return;
          dirty = true;
          set({
            saveStatus: error instanceof ScheduleConflictError ? 'conflict' : 'error',
            saveError: describeSaveError(error),
          });
          return;
        }
      }
      if (isCurrent(token, projectId)) set({ saveStatus: 'saved' });
    };

    const flush = (force = false): Promise<void> => {
      const { projectId, saveStatus } = get();
      if (!projectId) return Promise.resolve();
      if (saving) return saving;
      // A conflict waits for the user's decision (reload or overwrite).
      if (saveStatus === 'conflict' && !force) return Promise.resolve();
      const token = session;
      saving = writeLoop(token, projectId, force).finally(() => {
        saving = null;
      });
      return saving;
    };

    const load = async (projectId: UUID, token: number) => {
      try {
        const stored = await repository.get(projectId);
        if (token !== session) return;
        const schedule = stored ?? createEmptySchedule(projectId, now());
        baseRevision = stored?.revision ?? 0;
        dirty = false;
        set({
          status: 'ready',
          schedule,
          result: computeSchedule(schedule),
          saveStatus: 'saved',
          saveError: null,
          loadError: null,
        });
      } catch (error) {
        if (token !== session) return;
        set({
          status: 'error',
          loadError:
            error instanceof PersistenceError && error.reason === 'unsupported-version'
              ? 'Este cronograma foi salvo por uma versão mais nova do Horizon.'
              : 'Não foi possível carregar o cronograma deste projeto.',
        });
      }
    };

    return {
      projectId: null,
      status: 'idle',
      loadError: null,
      schedule: null,
      result: null,
      saveStatus: 'saved',
      saveError: null,

      open: async (projectId) => {
        session += 1;
        const token = session;
        unsubscribe?.();
        unsubscribe = repository.subscribe((changedId) => {
          if (changedId !== get().projectId) return;
          // Another tab saved this project: follow it when nothing is pending here,
          // otherwise let the next save report the conflict.
          if (!dirty && !saving && get().saveStatus === 'saved') void load(changedId, session);
        });
        // Nothing from the previous project may stay visible.
        set({
          projectId,
          status: 'loading',
          loadError: null,
          schedule: null,
          result: null,
          saveStatus: 'saved',
          saveError: null,
        });
        await load(projectId, token);
      },

      close: () => {
        session += 1;
        unsubscribe?.();
        unsubscribe = null;
        dirty = false;
        set({
          projectId: null,
          status: 'idle',
          loadError: null,
          schedule: null,
          result: null,
          saveStatus: 'saved',
          saveError: null,
        });
      },

      apply: (command) => {
        const { schedule } = get();
        if (!schedule) return { ok: false, error: 'O cronograma ainda não foi carregado.' };
        let next: ProjectSchedule;
        try {
          next = command(schedule);
        } catch (error) {
          if (error instanceof ScheduleRuleError) return { ok: false, error: error.message };
          throw error;
        }
        if (next === schedule) return { ok: true };
        set({ schedule: next, result: computeSchedule(next) });
        dirty = true;
        void flush();
        return { ok: true };
      },

      retrySave: async () => {
        if (get().saveStatus !== 'error') return;
        dirty = true;
        set({ saveStatus: 'saving' });
        await flush();
      },

      reload: async () => {
        const { projectId } = get();
        if (!projectId) return;
        session += 1;
        dirty = false;
        set({ status: 'loading' });
        const token = session;
        await load(projectId, token);
      },

      overwrite: async () => {
        if (get().saveStatus !== 'conflict') return;
        dirty = true;
        await flush(true);
      },
    };
  });
}

/** Ids for new tasks and links. */
export const generateScheduleId = createId;

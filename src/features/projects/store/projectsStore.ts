import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { getTodayIsoDate } from '@/features/timeline/lib/time';
import {
  PersistenceError,
  type ProjectRepository,
  projectRepository,
  ProjectValidationError,
  scheduleRepository,
} from '@/services/persistence';
import type {
  Project,
  ProjectDraft,
  ProjectFieldsPatch,
  ProjectPatch,
  UUID,
} from '@/types/project';

import { applyTransition, LifecycleError, type TransitionRequest } from '../lib/lifecycle';

export type ProjectsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ProjectsState {
  projects: Project[];
  status: ProjectsStatus;
  /** Last error, in pt-BR, ready to show to the user. */
  error: string | null;

  load: () => Promise<void>;
  /** Persists first (the repository generates id and timestamps), then adds to the list. */
  create: (draft: ProjectDraft) => Promise<Project>;
  /**
   * Optimistic: the change is visible at once (live timeline sync) and persisted in the
   * background. On failure the list is reloaded from the repository, the source of truth.
   */
  update: (id: UUID, patch: ProjectFieldsPatch) => Promise<void>;
  /**
   * Changes the status through the lifecycle rules. Rule violations throw a
   * `LifecycleError` before anything changes (shown in the dialog that asked); storage
   * failures are handled like `update`.
   */
  transition: (id: UUID, request: TransitionRequest, pendingTasks?: number) => Promise<void>;
  /** Hides the project from the default lists (a display preference). Optimistic. */
  hide: (id: UUID) => Promise<void>;
  unhide: (id: UUID) => Promise<void>;
  /** Soft delete: the project goes to the trash with all its data. Optimistic. */
  moveToTrash: (id: UUID) => Promise<void>;
  /** Takes the project out of the trash, keeping its status and hidden flag. */
  restore: (id: UUID) => Promise<void>;
  /**
   * Deletes a project and its schedule for good. Only for projects in the trash: anything
   * else is ignored, so no other path can skip the trash. Optimistic.
   */
  deletePermanently: (id: UUID) => Promise<void>;
  /**
   * Replaces every project (import, sample data, "clear all"). Persists first, so a
   * failure leaves both the list and the storage untouched.
   */
  replaceAll: (projects: Project[]) => Promise<void>;
  /**
   * Replaces the sample projects only (`demo`), keeping every other project as stored.
   * An empty list removes the samples.
   */
  replaceExamples: (examples: Project[]) => Promise<void>;
  clearError: () => void;
}

/** Turns repository errors into short pt-BR messages. */
export function describeError(error: unknown): string {
  if (error instanceof ProjectValidationError) return error.message;
  if (error instanceof PersistenceError && error.reason === 'quota-exceeded') {
    return 'Não há espaço suficiente no armazenamento do navegador.';
  }
  return 'Não foi possível salvar as alterações. Tente novamente.';
}

export interface ProjectsStoreOptions {
  /** Clock for the optimistic `updatedAt`; the repository sets the persisted value. */
  now?: () => Date;
  /**
   * Called after a project is deleted, to remove data that belongs to it (its schedule).
   * Failures only leave unreachable data behind, so they are logged, not shown.
   */
  onRemoved?: (id: UUID) => Promise<void>;
}

export type ProjectsStore = UseBoundStore<StoreApi<ProjectsState>>;

/** Factory so tests can inject an in-memory repository. */
export function createProjectsStore(
  repository: ProjectRepository,
  { now = () => new Date(), onRemoved }: ProjectsStoreOptions = {},
): ProjectsStore {
  return create<ProjectsState>()((set, get) => {
    /** Reloads the list after a failed optimistic change. */
    async function resync(error: unknown) {
      set({ error: describeError(error) });
      try {
        set({ projects: await repository.list() });
      } catch {
        set({ status: 'error' });
      }
    }

    /**
     * Applies a patch the stores computed (status, visibility): visible at once, then
     * persisted; on failure the list is reloaded from the repository.
     */
    async function applyPatch(id: UUID, patch: ProjectPatch, timestamp: string) {
      set((state) => ({
        projects: state.projects.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: timestamp } : item,
        ),
      }));
      try {
        const saved = await repository.update(id, patch);
        set((state) => ({
          projects: state.projects.map((item) =>
            item.id === id ? { ...item, updatedAt: saved.updatedAt } : item,
          ),
        }));
      } catch (error) {
        await resync(error);
      }
    }

    /** Sets a visibility timestamp, only when it changes. */
    async function setVisibility(
      id: UUID,
      field: 'hiddenAt' | 'deletedAt',
      on: boolean,
    ): Promise<void> {
      const project = get().projects.find((item) => item.id === id);
      // Samples are never hidden or trashed: "Remover exemplos" removes them.
      if (!project || project.demo || (project[field] !== null) === on) return;
      const timestamp = now().toISOString();
      await applyPatch(id, { [field]: on ? timestamp : null }, timestamp);
    }

    return {
      projects: [],
      status: 'idle',
      error: null,

      load: async () => {
        set({ status: 'loading', error: null });
        try {
          set({ projects: await repository.list(), status: 'ready' });
        } catch (error) {
          set({ status: 'error', error: describeError(error) });
        }
      },

      create: async (draft) => {
        try {
          const project = await repository.create(draft);
          set((state) => ({ projects: [...state.projects, project], error: null }));
          return project;
        } catch (error) {
          set({ error: describeError(error) });
          throw error;
        }
      },

      update: async (id, fields) => {
        // Samples are read-only: their data is the catalog's.
        if (get().projects.find((project) => project.id === id)?.demo) return;
        // Status, lifecycle and visibility have their own actions, even for untyped callers.
        const {
          status: _status,
          lifecycle: _lifecycle,
          hiddenAt: _hiddenAt,
          deletedAt: _deletedAt,
          ...patch
        } = fields as Project;
        const timestamp = now().toISOString();
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id ? { ...project, ...patch, updatedAt: timestamp } : project,
          ),
        }));

        try {
          const saved = await repository.update(id, patch);
          // Keep newer optimistic edits: only take the server-generated field.
          set((state) => ({
            projects: state.projects.map((project) =>
              project.id === id ? { ...project, updatedAt: saved.updatedAt } : project,
            ),
          }));
        } catch (error) {
          await resync(error);
        }
      },

      transition: async (id, request, pendingTasks = 0) => {
        const project = get().projects.find((item) => item.id === id);
        if (!project) throw new LifecycleError('Projeto não encontrado.', 'status');
        if (project.demo) {
          throw new LifecycleError('Projetos de exemplo não mudam de status.', 'status');
        }
        const clock = now();
        const patch = applyTransition(project, request, {
          today: getTodayIsoDate(clock),
          now: clock.toISOString(),
          pendingTasks,
        });
        await applyPatch(id, patch, clock.toISOString());
      },

      hide: (id) => setVisibility(id, 'hiddenAt', true),
      unhide: (id) => setVisibility(id, 'hiddenAt', false),
      moveToTrash: (id) => setVisibility(id, 'deletedAt', true),
      restore: (id) => setVisibility(id, 'deletedAt', false),

      deletePermanently: async (id) => {
        if (get().projects.find((project) => project.id === id)?.deletedAt == null) return;
        set((state) => ({ projects: state.projects.filter((project) => project.id !== id) }));
        try {
          await repository.remove(id);
        } catch (error) {
          await resync(error);
          return;
        }
        try {
          await onRemoved?.(id);
        } catch (error) {
          console.warn(
            '[persistence] Não foi possível apagar os dados do projeto removido.',
            error,
          );
        }
      },

      replaceAll: async (projects) => {
        try {
          await repository.replaceAll(projects);
          set({ projects: await repository.list(), error: null });
        } catch (error) {
          set({ error: describeError(error) });
          throw error;
        }
      },

      replaceExamples: async (examples) => {
        try {
          const own = (await repository.list()).filter((project) => !project.demo);
          await repository.replaceAll([
            ...own,
            ...examples.map((project) => ({ ...project, demo: true })),
          ]);
          set({ projects: await repository.list(), error: null });
        } catch (error) {
          set({ error: describeError(error) });
          throw error;
        }
      },

      clearError: () => {
        if (get().error !== null) set({ error: null });
      },
    };
  });
}

/** The app's projects store, backed by the configured repository. */
export const useProjectsStore = createProjectsStore(projectRepository, {
  // Deleting a project deletes its schedule: no orphaned plans are left in storage.
  onRemoved: (id) => scheduleRepository.remove(id),
});

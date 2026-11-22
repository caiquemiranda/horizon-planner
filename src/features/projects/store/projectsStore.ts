import { create, type StoreApi, type UseBoundStore } from 'zustand';

import {
  PersistenceError,
  type ProjectRepository,
  projectRepository,
  ProjectValidationError,
} from '@/services/persistence';
import type { Project, ProjectDraft, ProjectPatch, UUID } from '@/types/project';

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
  update: (id: UUID, patch: ProjectPatch) => Promise<void>;
  /** Optimistic, with the same recovery as `update`. */
  remove: (id: UUID) => Promise<void>;
  /**
   * Replaces every project (import, sample data, "clear all"). Persists first, so a
   * failure leaves both the list and the storage untouched.
   */
  replaceAll: (projects: Project[]) => Promise<void>;
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
}

export type ProjectsStore = UseBoundStore<StoreApi<ProjectsState>>;

/** Factory so tests can inject an in-memory repository. */
export function createProjectsStore(
  repository: ProjectRepository,
  { now = () => new Date() }: ProjectsStoreOptions = {},
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

      update: async (id, patch) => {
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

      remove: async (id) => {
        set((state) => ({ projects: state.projects.filter((project) => project.id !== id) }));
        try {
          await repository.remove(id);
        } catch (error) {
          await resync(error);
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

      clearError: () => {
        if (get().error !== null) set({ error: null });
      },
    };
  });
}

/** The app's projects store, backed by the configured repository. */
export const useProjectsStore = createProjectsStore(projectRepository);

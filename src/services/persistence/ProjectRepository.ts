import type { Project, ProjectDraft, ProjectPatch, UUID } from '@/types/project';

/**
 * Persistence contract for projects (see ADR-003 in docs/architecture.md).
 *
 * The contract is asynchronous even though the MVP uses synchronous `localStorage`,
 * so an HTTP implementation can be swapped in without touching stores or UI.
 *
 * Every implementation must:
 * - validate input and reject with `ProjectValidationError` on invalid data;
 * - reject with `ProjectNotFoundError` when an id does not exist;
 * - reject with `PersistenceError` when the underlying storage fails;
 * - return copies, never internal references.
 */
export interface ProjectRepository {
  /** All projects in insertion order. */
  list(): Promise<Project[]>;

  /** A single project, or `null` when it does not exist. */
  get(id: UUID): Promise<Project | null>;

  /** Creates a project, generating `id`, `sortOrder`, `createdAt` and `updatedAt`. */
  create(draft: ProjectDraft): Promise<Project>;

  /** Applies a partial update and refreshes `updatedAt`. */
  update(id: UUID, patch: ProjectPatch): Promise<Project>;

  /** Removes a project. */
  remove(id: UUID): Promise<void>;

  /** Replaces every project at once. Used by import, sample data and "clear all". */
  replaceAll(projects: Project[]): Promise<void>;
}

import { SNAPSHOT_SCHEMA_VERSION } from '@/features/projects/constants';
import { createInitialLifecycle } from '@/features/projects/lib/lifecycle';
import { projectDraftSchema, projectSchema, snapshotSchema } from '@/features/projects/schemas';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { createId } from '@/lib/id';
import type { Project, ProjectDraft, ProjectPatch, UUID } from '@/types/project';

import { ProjectNotFoundError, ProjectValidationError } from './errors';
import type { ProjectRepository } from './ProjectRepository';

export interface RepositoryDependencies {
  /** Clock used for `createdAt` / `updatedAt`. Injected for deterministic tests. */
  now?: () => Date;
  /** Id generator. Injected for deterministic tests. */
  generateId?: () => UUID;
}

/**
 * Wraps synchronous work in a promise so errors become rejections
 * instead of being thrown synchronously from an async-looking API.
 */
export function toPromise<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Repository that keeps projects in memory.
 * Used directly in tests and as the working copy behind `LocalStorageRepository`.
 */
export class InMemoryRepository implements ProjectRepository {
  private projects = new Map<UUID, Project>();
  private readonly now: () => Date;
  private readonly generateId: () => UUID;

  constructor(initialProjects: Project[] = [], dependencies: RepositoryDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date());
    this.generateId = dependencies.generateId ?? createId;
    this.setAll(initialProjects);
  }

  list(): Promise<Project[]> {
    return toPromise(() => this.listSync());
  }

  get(id: UUID): Promise<Project | null> {
    return toPromise(() => {
      const project = this.projects.get(id);
      return project ? structuredClone(project) : null;
    });
  }

  create(draft: ProjectDraft): Promise<Project> {
    return toPromise(() => {
      const parsed = projectDraftSchema.safeParse(draft);
      if (!parsed.success) throw new ProjectValidationError(parsed.error.issues);

      const now = this.now();
      const timestamp = now.toISOString();
      const project: Project = {
        ...parsed.data,
        lifecycle: createInitialLifecycle(parsed.data.status, getTodayIsoDate(now), timestamp),
        hiddenAt: null,
        deletedAt: null,
        id: this.generateId(),
        sortOrder: this.nextSortOrder(parsed.data.horizon),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      this.projects.set(project.id, project);
      return structuredClone(project);
    });
  }

  update(id: UUID, patch: ProjectPatch): Promise<Project> {
    return toPromise(() => {
      const current = this.projects.get(id);
      if (!current) throw new ProjectNotFoundError(id);

      const parsed = projectSchema.safeParse({
        ...current,
        ...patch,
        id: current.id,
        sortOrder: current.sortOrder,
        createdAt: current.createdAt,
        updatedAt: this.now().toISOString(),
      });
      if (!parsed.success) throw new ProjectValidationError(parsed.error.issues);

      this.projects.set(id, parsed.data);
      return structuredClone(parsed.data);
    });
  }

  remove(id: UUID): Promise<void> {
    return toPromise(() => {
      if (!this.projects.delete(id)) throw new ProjectNotFoundError(id);
    });
  }

  replaceAll(projects: Project[]): Promise<void> {
    return toPromise(() => {
      this.setAll(projects);
    });
  }

  /** Synchronous snapshot of the current state, for subclasses that persist it. */
  protected listSync(): Project[] {
    return Array.from(this.projects.values(), (project) => structuredClone(project));
  }

  /** Validates and replaces the whole collection (all-or-nothing). */
  protected setAll(projects: Project[]): void {
    const parsed = snapshotSchema.safeParse({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      projects,
    });
    if (!parsed.success) throw new ProjectValidationError(parsed.error.issues);

    this.projects = new Map(parsed.data.projects.map((project) => [project.id, project]));
  }

  private nextSortOrder(horizon: Project['horizon']): number {
    let max = -1;
    for (const project of this.projects.values()) {
      if (project.horizon === horizon && project.sortOrder > max) max = project.sortOrder;
    }
    return max + 1;
  }
}

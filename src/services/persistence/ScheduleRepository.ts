import { projectScheduleSchema } from '@/features/schedule/schemas';
import type { UUID } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { ProjectValidationError } from './errors';

/**
 * Persistence contract for project schedules (tasks, links and calendar).
 *
 * Each project's schedule is stored on its own, so opening a project only reads that
 * project's data. Writes use optimistic concurrency: `save` succeeds only when the stored
 * `revision` is the one the caller started from, so edits made elsewhere (another tab,
 * later a server) are never overwritten silently.
 */
export interface ScheduleRepository {
  /** The project's schedule, or `null` when it has never been planned. */
  get(projectId: UUID): Promise<ProjectSchedule | null>;

  /**
   * Validates and stores a schedule, returning it with `revision + 1` and a new
   * `updatedAt`. Rejects with `ScheduleConflictError` when the stored revision is not
   * `expectedRevision` (use `0` for a schedule that was never saved).
   */
  save(schedule: ProjectSchedule, expectedRevision: number): Promise<ProjectSchedule>;

  /** Removes a project's schedule (when the project is deleted). */
  remove(projectId: UUID): Promise<void>;

  /** Every stored schedule (backup export). */
  listAll(): Promise<ProjectSchedule[]>;

  /** Replaces every schedule (import, sample data, "clear all"). */
  replaceAll(schedules: readonly ProjectSchedule[]): Promise<void>;

  /**
   * Called with a project id when its schedule changes outside this repository
   * instance, e.g. in another browser tab. Returns an unsubscribe function.
   */
  subscribe(listener: (projectId: UUID) => void): () => void;
}

/** The stored schedule changed since it was loaded. */
export class ScheduleConflictError extends Error {
  override readonly name = 'ScheduleConflictError';

  constructor(
    readonly projectId: UUID,
    readonly storedRevision: number,
  ) {
    super('O cronograma foi alterado em outra aba ou janela.');
  }
}

/** Validates a schedule before it is written. */
export function validateSchedule(schedule: unknown): ProjectSchedule {
  const parsed = projectScheduleSchema.safeParse(schedule);
  if (!parsed.success) throw new ProjectValidationError(parsed.error.issues);
  return parsed.data;
}

/**
 * Schedules kept in memory. Used in tests and as a reference implementation of the
 * contract (including revisions and conflicts).
 */
export class InMemoryScheduleRepository implements ScheduleRepository {
  private readonly schedules = new Map<UUID, ProjectSchedule>();
  private readonly listeners = new Set<(projectId: UUID) => void>();
  private readonly now: () => Date;

  constructor(initial: readonly ProjectSchedule[] = [], now: () => Date = () => new Date()) {
    this.now = now;
    for (const schedule of initial)
      this.schedules.set(schedule.projectId, structuredClone(schedule));
  }

  get(projectId: UUID): Promise<ProjectSchedule | null> {
    const schedule = this.schedules.get(projectId);
    return Promise.resolve(schedule ? structuredClone(schedule) : null);
  }

  save(schedule: ProjectSchedule, expectedRevision: number): Promise<ProjectSchedule> {
    try {
      const storedRevision = this.schedules.get(schedule.projectId)?.revision ?? 0;
      if (storedRevision !== expectedRevision) {
        throw new ScheduleConflictError(schedule.projectId, storedRevision);
      }
      const saved = validateSchedule({
        ...schedule,
        revision: storedRevision + 1,
        updatedAt: this.now().toISOString(),
      });
      this.schedules.set(saved.projectId, structuredClone(saved));
      return Promise.resolve(structuredClone(saved));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  remove(projectId: UUID): Promise<void> {
    this.schedules.delete(projectId);
    return Promise.resolve();
  }

  listAll(): Promise<ProjectSchedule[]> {
    return Promise.resolve(
      [...this.schedules.values()].map((schedule) => structuredClone(schedule)),
    );
  }

  replaceAll(schedules: readonly ProjectSchedule[]): Promise<void> {
    try {
      const validated = schedules.map((schedule) => validateSchedule(schedule));
      this.schedules.clear();
      for (const schedule of validated) this.schedules.set(schedule.projectId, schedule);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  subscribe(listener: (projectId: UUID) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Test helper: simulates an edit made by another tab. With `notify: false` the change
   * event has not arrived yet, as when both tabs save at nearly the same time.
   */
  changeExternally(schedule: ProjectSchedule, { notify = true } = {}): void {
    this.schedules.set(schedule.projectId, structuredClone(schedule));
    if (notify) for (const listener of this.listeners) listener(schedule.projectId);
  }
}

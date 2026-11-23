import type { UUID } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { PersistenceError } from './errors';
import {
  ScheduleConflictError,
  type ScheduleRepository,
  validateSchedule,
} from './ScheduleRepository';

/** One key per project: `horizon-planner:schedule:<projectId>`. */
export const SCHEDULE_KEY_PREFIX = 'horizon-planner:schedule:';

/**
 * Version of the stored envelope; bump it with a migration when the format changes.
 * - 1: tasks, links and calendar;
 * - 2: work done per task, actual dates and daily check-ins;
 * - 3: the baseline.
 * Older versions are read as is: the schedule schema fills the new fields
 * (`schedule/schemas.ts`).
 */
export const SCHEDULE_STORAGE_VERSION = 3;
const READABLE_VERSIONS: readonly number[] = [1, 2, 3];

interface StoredSchedule {
  schemaVersion: number;
  schedule: ProjectSchedule;
}

export interface LocalStorageScheduleRepositoryOptions {
  storage?: Storage;
  /** Window whose `storage` events report changes made by other tabs. */
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now?: () => Date;
  /** Called when a stored schedule cannot be read; its raw value is kept under `backupKey`. */
  onRecover?: (error: PersistenceError, backupKey: string) => void;
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function writeError(error: unknown): PersistenceError {
  return isQuotaExceeded(error)
    ? new PersistenceError('quota-exceeded', 'O armazenamento local está cheio.', { cause: error })
    : new PersistenceError('unavailable', 'Não foi possível salvar o cronograma.', {
        cause: error,
      });
}

/**
 * Schedules in `localStorage`, one key per project. Every read goes to storage (no
 * cache), so revisions written by other tabs are always seen before saving.
 */
export class LocalStorageScheduleRepository implements ScheduleRepository {
  private storage: Storage | undefined;
  private readonly eventTarget: LocalStorageScheduleRepositoryOptions['eventTarget'];
  private readonly now: () => Date;
  private readonly onRecover: LocalStorageScheduleRepositoryOptions['onRecover'];

  constructor(options: LocalStorageScheduleRepositoryOptions = {}) {
    this.storage = options.storage;
    this.eventTarget = options.eventTarget ?? (typeof window === 'undefined' ? undefined : window);
    this.now = options.now ?? (() => new Date());
    this.onRecover = options.onRecover;
  }

  get(projectId: UUID): Promise<ProjectSchedule | null> {
    return this.run(() => this.read(projectId));
  }

  save(schedule: ProjectSchedule, expectedRevision: number): Promise<ProjectSchedule> {
    return this.run(() => {
      const storedRevision = this.read(schedule.projectId)?.revision ?? 0;
      if (storedRevision !== expectedRevision) {
        throw new ScheduleConflictError(schedule.projectId, storedRevision);
      }
      const saved = validateSchedule({
        ...schedule,
        revision: storedRevision + 1,
        updatedAt: this.now().toISOString(),
      });
      this.write(saved);
      return saved;
    });
  }

  remove(projectId: UUID): Promise<void> {
    return this.run(() => {
      this.getStorage().removeItem(SCHEDULE_KEY_PREFIX + projectId);
    });
  }

  listAll(): Promise<ProjectSchedule[]> {
    return this.run(() =>
      this.keys()
        .map((key) => this.read(key.slice(SCHEDULE_KEY_PREFIX.length)))
        .filter((schedule): schedule is ProjectSchedule => schedule !== null),
    );
  }

  replaceAll(schedules: readonly ProjectSchedule[]): Promise<void> {
    return this.run(() => {
      const validated = schedules.map((schedule) => validateSchedule(schedule));
      const storage = this.getStorage();
      const previous = new Map(this.keys().map((key) => [key, storage.getItem(key)]));
      try {
        for (const key of previous.keys()) storage.removeItem(key);
        for (const schedule of validated) this.write(schedule);
      } catch (error) {
        // Put everything back as it was: a partial replacement would mix data sets.
        try {
          for (const key of this.keys()) storage.removeItem(key);
          for (const [key, value] of previous) if (value !== null) storage.setItem(key, value);
        } catch {
          // Best effort; the original error below is what the caller needs to know.
        }
        throw error;
      }
    });
  }

  subscribe(listener: (projectId: UUID) => void): () => void {
    const target = this.eventTarget;
    if (!target) return () => undefined;
    const handle = (event: Event) => {
      const key = (event as StorageEvent).key;
      if (!key?.startsWith(SCHEDULE_KEY_PREFIX) || key.includes(':backup:')) return;
      listener(key.slice(SCHEDULE_KEY_PREFIX.length));
    };
    target.addEventListener('storage', handle);
    return () => {
      target.removeEventListener('storage', handle);
    };
  }

  private run<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private getStorage(): Storage {
    if (this.storage) return this.storage;
    try {
      this.storage = window.localStorage;
      return this.storage;
    } catch (error) {
      throw new PersistenceError('unavailable', 'O armazenamento local não está disponível.', {
        cause: error,
      });
    }
  }

  private keys(): string[] {
    const storage = this.getStorage();
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(SCHEDULE_KEY_PREFIX) && !key.includes(':backup:')) keys.push(key);
    }
    return keys;
  }

  private read(projectId: UUID): ProjectSchedule | null {
    const storage = this.getStorage();
    const key = SCHEDULE_KEY_PREFIX + projectId;
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      throw new PersistenceError('unavailable', 'Não foi possível ler o armazenamento local.', {
        cause: error,
      });
    }
    if (raw === null) return null;

    try {
      const stored = JSON.parse(raw) as Partial<StoredSchedule>;
      if (!READABLE_VERSIONS.includes(stored.schemaVersion ?? -1)) {
        throw new PersistenceError(
          typeof stored.schemaVersion === 'number' &&
            stored.schemaVersion > SCHEDULE_STORAGE_VERSION
            ? 'unsupported-version'
            : 'corrupted',
          'O cronograma salvo está em um formato desconhecido.',
        );
      }
      const schedule = validateSchedule(stored.schedule);
      if (schedule.projectId !== projectId) {
        throw new PersistenceError('corrupted', 'O cronograma salvo pertence a outro projeto.');
      }
      return schedule;
    } catch (error) {
      const persistenceError =
        error instanceof PersistenceError
          ? error
          : new PersistenceError('corrupted', 'O cronograma salvo não pôde ser lido.', {
              cause: error,
            });
      if (persistenceError.reason === 'unsupported-version') throw persistenceError;
      // Keep a copy of the unreadable data, then start this project's plan from scratch.
      const backupKey = `${key}:backup:${this.now().toISOString()}`;
      try {
        storage.setItem(backupKey, raw);
        storage.removeItem(key);
      } catch {
        // Best effort: the original value stays in place.
      }
      this.onRecover?.(persistenceError, backupKey);
      return null;
    }
  }

  private write(schedule: ProjectSchedule): void {
    const stored: StoredSchedule = { schemaVersion: SCHEDULE_STORAGE_VERSION, schedule };
    try {
      this.getStorage().setItem(SCHEDULE_KEY_PREFIX + schedule.projectId, JSON.stringify(stored));
    } catch (error) {
      throw writeError(error);
    }
  }
}

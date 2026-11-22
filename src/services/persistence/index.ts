import { LocalStorageRepository } from './LocalStorageRepository';
import { LocalStorageScheduleRepository } from './LocalStorageScheduleRepository';
import type { ProjectRepository } from './ProjectRepository';
import type { ScheduleRepository } from './ScheduleRepository';

export * from './errors';
export { InMemoryRepository, type RepositoryDependencies } from './InMemoryRepository';
export {
  DEFAULT_STORAGE_KEY,
  LocalStorageRepository,
  type LocalStorageRepositoryOptions,
} from './LocalStorageRepository';
export {
  LocalStorageScheduleRepository,
  type LocalStorageScheduleRepositoryOptions,
  SCHEDULE_KEY_PREFIX,
} from './LocalStorageScheduleRepository';
export { migrateSnapshot } from './migrations';
export type { ProjectRepository } from './ProjectRepository';
export {
  InMemoryScheduleRepository,
  ScheduleConflictError,
  type ScheduleRepository,
  validateSchedule,
} from './ScheduleRepository';

/**
 * Composition root for persistence: the only place that decides which implementation
 * the app uses. Swap it here to move from `localStorage` to an API.
 */
export function createProjectRepository(): ProjectRepository {
  return new LocalStorageRepository({
    onRecover: (error, backupKey) => {
      console.warn(`[persistence] ${error.message} A cópia dos dados foi salva em "${backupKey}".`);
    },
  });
}

export const projectRepository: ProjectRepository = createProjectRepository();

export function createScheduleRepository(): ScheduleRepository {
  return new LocalStorageScheduleRepository({
    onRecover: (error, backupKey) => {
      console.warn(`[persistence] ${error.message} A cópia dos dados foi salva em "${backupKey}".`);
    },
  });
}

export const scheduleRepository: ScheduleRepository = createScheduleRepository();

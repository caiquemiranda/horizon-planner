import { SNAPSHOT_SCHEMA_VERSION } from '@/features/projects/constants';
import type { HorizonSnapshot, Project, ProjectDraft, ProjectPatch, UUID } from '@/types/project';

import { PersistenceError } from './errors';
import { InMemoryRepository, type RepositoryDependencies } from './InMemoryRepository';
import { migrateSnapshot } from './migrations';

export const DEFAULT_STORAGE_KEY = 'horizon-planner:data';

export interface LocalStorageRepositoryOptions extends RepositoryDependencies {
  /** Storage backend. Defaults to `window.localStorage`, resolved lazily. */
  storage?: Storage;
  /** Key under which the snapshot is stored. */
  key?: string;
  /**
   * Called when stored data could not be loaded. The raw value is preserved under
   * `backupKey` and the repository starts empty, so the app never crashes on bad data.
   */
  onRecover?: (error: PersistenceError, backupKey: string) => void;
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/**
 * MVP repository: keeps a working copy in memory and writes the full snapshot to
 * `localStorage` after every mutation. Failed writes are rolled back in memory.
 */
export class LocalStorageRepository extends InMemoryRepository {
  private readonly key: string;
  private readonly onRecover: LocalStorageRepositoryOptions['onRecover'];
  private readonly clock: () => Date;
  private storage: Storage | undefined;
  private loaded = false;

  constructor(options: LocalStorageRepositoryOptions = {}) {
    super([], options);
    this.key = options.key ?? DEFAULT_STORAGE_KEY;
    this.onRecover = options.onRecover;
    this.clock = options.now ?? (() => new Date());
    this.storage = options.storage;
  }

  override list(): Promise<Project[]> {
    return this.read(() => super.list());
  }

  override get(id: UUID): Promise<Project | null> {
    return this.read(() => super.get(id));
  }

  override create(draft: ProjectDraft): Promise<Project> {
    return this.mutate(() => super.create(draft));
  }

  override update(id: UUID, patch: ProjectPatch): Promise<Project> {
    return this.mutate(() => super.update(id, patch));
  }

  override remove(id: UUID): Promise<void> {
    return this.mutate(() => super.remove(id));
  }

  override replaceAll(projects: Project[]): Promise<void> {
    return this.mutate(() => super.replaceAll(projects));
  }

  private async read<T>(operation: () => Promise<T>): Promise<T> {
    this.ensureLoaded();
    return operation();
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    this.ensureLoaded();
    const previous = this.listSync();
    const result = await operation();

    try {
      this.persist();
    } catch (error) {
      this.setAll(previous);
      throw error;
    }

    return result;
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

  private ensureLoaded(): void {
    if (this.loaded) return;

    const storage = this.getStorage();
    let raw: string | null;

    try {
      raw = storage.getItem(this.key);
    } catch (error) {
      throw new PersistenceError('unavailable', 'Não foi possível ler o armazenamento local.', {
        cause: error,
      });
    }

    this.loaded = true;
    if (raw === null) return;

    try {
      this.setAll(migrateSnapshot(JSON.parse(raw)).projects);
    } catch (error) {
      this.recover(storage, raw, error);
    }
  }

  private recover(storage: Storage, raw: string, error: unknown): void {
    const persistenceError =
      error instanceof PersistenceError
        ? error
        : new PersistenceError('corrupted', 'Os dados salvos não puderam ser lidos.', {
            cause: error,
          });

    const backupKey = `${this.key}:backup:${this.clock().toISOString()}`;

    try {
      storage.setItem(backupKey, raw);
    } catch {
      // Best effort: the original key is left untouched until the next successful write.
    }

    this.setAll([]);
    this.onRecover?.(persistenceError, backupKey);
  }

  private persist(): void {
    const snapshot: HorizonSnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: this.clock().toISOString(),
      projects: this.listSync(),
    };

    try {
      this.getStorage().setItem(this.key, JSON.stringify(snapshot));
    } catch (error) {
      if (error instanceof PersistenceError) throw error;

      throw isQuotaExceeded(error)
        ? new PersistenceError('quota-exceeded', 'O armazenamento local está cheio.', {
            cause: error,
          })
        : new PersistenceError('unavailable', 'Não foi possível salvar os dados.', {
            cause: error,
          });
    }
  }
}

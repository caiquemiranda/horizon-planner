import { SNAPSHOT_SCHEMA_VERSION } from '@/features/projects/constants';
import { snapshotSchema } from '@/features/projects/schemas';
import type { HorizonSnapshot } from '@/types/project';

import { PersistenceError, ProjectValidationError } from './errors';

type UnknownRecord = Record<string, unknown>;

/** Upgrades a snapshot by exactly one version and must bump `schemaVersion`. */
export type SnapshotMigration = (snapshot: UnknownRecord) => UnknownRecord;

/**
 * Migrations keyed by the version they upgrade **from**.
 *
 * When the data format changes:
 * 1. bump `SNAPSHOT_SCHEMA_VERSION` and update the zod schemas;
 * 2. add an entry here, e.g. `1: (data) => ({ ...data, schemaVersion: 2, ... })`;
 * 3. add a test with a fixture of the previous version.
 */
export const SNAPSHOT_MIGRATIONS: Readonly<Partial<Record<number, SnapshotMigration>>> = {
  1: addLifecycle,
  2: addVisibility,
  3: addDemoFlag,
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v1 → v2: adds `lifecycle` to every project. Version 1 kept no lifecycle facts, so the
 * backfill only uses what the data shows and leaves the rest empty:
 * - `startedAt`: the planned start of every project past `planned`;
 * - `completedAt` / `closedAt`: the day of the last change (`updatedAt`), the latest day
 *   the status can have been set;
 * - postponed projects get an empty reason and no dates ("sem previsão informada");
 * - `history` stays empty: no event is invented.
 */
/** v2 → v3: every project starts visible and outside the trash. */
function addVisibility(snapshot: UnknownRecord): UnknownRecord {
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  return {
    ...snapshot,
    schemaVersion: 3,
    projects: projects.map((project: unknown) =>
      isRecord(project) ? { ...project, hiddenAt: null, deletedAt: null } : project,
    ),
  };
}

/** v3 → v4: sample projects did not exist as such, so every stored project is a real one. */
function addDemoFlag(snapshot: UnknownRecord): UnknownRecord {
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  return {
    ...snapshot,
    schemaVersion: 4,
    projects: projects.map((project: unknown) =>
      isRecord(project) ? { ...project, demo: false } : project,
    ),
  };
}

function addLifecycle(snapshot: UnknownRecord): UnknownRecord {
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
  return {
    ...snapshot,
    schemaVersion: 2,
    projects: projects.map((project: unknown) => {
      if (!isRecord(project)) return project;
      const status = project.status;
      const lastChange =
        typeof project.updatedAt === 'string' ? project.updatedAt.slice(0, 10) : null;
      return {
        ...project,
        lifecycle: {
          startedAt: status !== 'planned' ? (project.startDate ?? null) : null,
          completedAt: status === 'completed' ? lastChange : null,
          closedAt: status === 'cancelled' ? lastChange : null,
          closeReason: null,
          postponement:
            status === 'paused'
              ? { reason: '', expectedResumeAt: null, revisedFinish: null }
              : null,
          history: [],
        },
      };
    }),
  };
}

/**
 * Upgrades raw persisted or imported data to the current schema version and validates it.
 *
 * @throws {PersistenceError} `unsupported-version` for data written by a newer app version,
 *   or `corrupted` when the data is malformed or fails validation.
 */
export function migrateSnapshot(
  raw: unknown,
  migrations: Readonly<Partial<Record<number, SnapshotMigration>>> = SNAPSHOT_MIGRATIONS,
  currentVersion: number = SNAPSHOT_SCHEMA_VERSION,
): HorizonSnapshot {
  if (!isRecord(raw)) {
    throw new PersistenceError('corrupted', 'Os dados não estão em um formato reconhecido.');
  }

  const rawVersion = raw.schemaVersion;

  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1) {
    throw new PersistenceError('corrupted', 'Os dados não informam uma versão válida.');
  }

  if (rawVersion > currentVersion) {
    throw new PersistenceError(
      'unsupported-version',
      `Os dados foram gerados por uma versão mais nova do Horizon (formato v${rawVersion}).`,
    );
  }

  let data: UnknownRecord = raw;
  let version: number = rawVersion;

  while (version < currentVersion) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new PersistenceError(
        'unsupported-version',
        `Não há migração disponível a partir do formato v${version}.`,
      );
    }

    data = migrate(data);
    const nextVersion: unknown = data.schemaVersion;

    if (nextVersion !== version + 1) {
      throw new PersistenceError(
        'corrupted',
        `A migração do formato v${version} não atualizou a versão corretamente.`,
      );
    }

    version = nextVersion;
  }

  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) {
    throw new PersistenceError('corrupted', 'Os dados contêm projetos inválidos.', {
      cause: new ProjectValidationError(parsed.error.issues),
    });
  }

  return parsed.data;
}

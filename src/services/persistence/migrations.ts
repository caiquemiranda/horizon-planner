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
export const SNAPSHOT_MIGRATIONS: Readonly<Partial<Record<number, SnapshotMigration>>> = {};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

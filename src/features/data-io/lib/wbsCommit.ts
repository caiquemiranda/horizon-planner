import { DEFAULT_COLOR, DEFAULT_HORIZON, DEFAULT_STATUS } from '@/features/projects/constants';
import { suggestHorizon } from '@/features/projects/lib/form';
import { getDisplayFinish } from '@/features/schedule/lib/engine';
import { dayToIsoDate } from '@/features/timeline/lib/time';
import type { ISODate, Project, ProjectDraft, UUID } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import type { ColumnMapping, ImportPreview } from './wbsImport';

/**
 * Spreadsheet import, second phase: write the previewed project.
 *
 * There is no server transaction, so the two writes are ordered and undone on failure:
 * the project is created first (its repository gives the id), then its schedule is saved
 * as revision 1. If the schedule cannot be saved, the project is removed again, so no
 * half-imported project is left behind.
 *
 * A fingerprint of the file and of the chosen sheet and columns is the idempotency key:
 * a double click, a retry or the same file imported again opens the project already
 * created instead of creating a second one, while that project still exists.
 */

export interface ImportCommitDependencies {
  createProject: (draft: ProjectDraft) => Promise<Project>;
  /** Saves a schedule that was never saved (`expectedRevision` 0). */
  saveSchedule: (schedule: ProjectSchedule) => Promise<ProjectSchedule>;
  /** Undoes `createProject` when the schedule cannot be saved. */
  removeProject: (id: UUID) => Promise<void>;
  /** Whether a previously imported project is still there (not deleted or in the trash). */
  projectExists: (id: UUID) => boolean;
  /** Where fingerprints of finished imports are kept; `null` keeps them in memory only. */
  storage: Storage | null;
}

export type ImportCommitResult =
  | { status: 'created'; project: Project; counts: ImportPreview['counts'] }
  /** The same file was already imported: nothing was written. */
  | { status: 'duplicate'; projectId: UUID };

export class ImportCommitError extends Error {
  override readonly name = 'ImportCommitError';
}

export const IMPORT_FINGERPRINTS_KEY = 'horizon-planner:imports';
/** Older fingerprints are dropped beyond this. */
const MAX_FINGERPRINTS = 50;

/**
 * cyrb53: a fast 53-bit hash. Not a security measure, only a key telling the same file
 * and choices apart from different ones.
 */
function hash(bytes: Uint8Array, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The idempotency key of an import: file content, tasks sheet and column mapping. */
export function getImportFingerprint(
  bytes: Uint8Array,
  tasksSheet: string | null,
  mapping: ColumnMapping,
): string {
  const choices = JSON.stringify({
    sheet: tasksSheet,
    mapping: Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)),
  });
  const content = hash(bytes);
  return `${String(bytes.length)}-${content}-${hash(new TextEncoder().encode(choices))}`;
}

/** The project a preview creates; its dates span the schedule (a final milestone included). */
export function buildImportDraft(preview: ImportPreview, today: ISODate): ProjectDraft {
  const range = preview.result.range;
  let startDate = today;
  let endDate = today;
  if (range) {
    let lastDay = range.start;
    for (const task of preview.result.tasks.values()) {
      lastDay = Math.max(lastDay, getDisplayFinish(task));
    }
    startDate = dayToIsoDate(range.start);
    endDate = dayToIsoDate(lastDay);
  }
  return {
    title: preview.project.title,
    description: preview.project.description,
    horizon: suggestHorizon(startDate, endDate) ?? DEFAULT_HORIZON,
    category: preview.project.category,
    status: DEFAULT_STATUS,
    color: DEFAULT_COLOR,
    startDate,
    endDate,
    progress: preview.result.progress,
    milestones: [],
  };
}

type FingerprintRecord = Record<string, UUID>;

export function createImportCommitter(dependencies: ImportCommitDependencies) {
  const { createProject, saveSchedule, removeProject, projectExists, storage } = dependencies;
  let memory: FingerprintRecord = {};
  /** Imports still being written, so a second click waits for the first. */
  const pending = new Map<string, Promise<ImportCommitResult>>();

  function readRecord(): FingerprintRecord {
    if (!storage) return memory;
    try {
      const raw = storage.getItem(IMPORT_FINGERPRINTS_KEY);
      if (raw === null) return {};
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, UUID] => typeof entry[1] === 'string',
          ),
        );
      }
    } catch {
      // Unreadable or invalid: fall back to what this session remembers.
    }
    return memory;
  }

  function writeRecord(record: FingerprintRecord) {
    const entries = Object.entries(record);
    memory = Object.fromEntries(entries.slice(Math.max(0, entries.length - MAX_FINGERPRINTS)));
    try {
      storage?.setItem(IMPORT_FINGERPRINTS_KEY, JSON.stringify(memory));
    } catch {
      // Storage full or blocked: the key still protects this session.
    }
  }

  async function write(
    preview: ImportPreview,
    fingerprint: string,
    today: ISODate,
  ): Promise<ImportCommitResult> {
    const existing = readRecord()[fingerprint];
    if (existing && projectExists(existing)) return { status: 'duplicate', projectId: existing };

    const project = await createProject(buildImportDraft(preview, today));
    try {
      await saveSchedule({ ...preview.schedule, projectId: project.id });
    } catch (error) {
      try {
        await removeProject(project.id);
      } catch (cleanup) {
        console.warn('[import] Não foi possível desfazer o projeto importado.', cleanup);
      }
      throw new ImportCommitError(
        'Não foi possível gravar o cronograma importado. Nada foi criado.',
        { cause: error },
      );
    }

    // Re-added last, so the newest fingerprints survive the size limit.
    const record: FingerprintRecord = Object.fromEntries(
      Object.entries(readRecord()).filter(([key]) => key !== fingerprint),
    );
    record[fingerprint] = project.id;
    writeRecord(record);
    return { status: 'created', project, counts: preview.counts };
  }

  /** Writes the previewed project and schedule; see the module comment for the guarantees. */
  function commit(
    preview: ImportPreview,
    fingerprint: string,
    today: ISODate,
  ): Promise<ImportCommitResult> {
    if (!preview.canImport || preview.schedule.tasks.length === 0) {
      return Promise.reject(new ImportCommitError('A prévia tem erros: nada foi gravado.'));
    }
    const running = pending.get(fingerprint);
    if (running) return running;
    const work = write(preview, fingerprint, today).finally(() => {
      pending.delete(fingerprint);
    });
    pending.set(fingerprint, work);
    return work;
  }

  return { commit };
}

export type ImportCommitter = ReturnType<typeof createImportCommitter>;

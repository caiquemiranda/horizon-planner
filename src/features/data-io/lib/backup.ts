import type { z } from 'zod';

import { SNAPSHOT_SCHEMA_VERSION } from '@/features/projects/constants';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { migrateSnapshot, PersistenceError, ProjectValidationError } from '@/services/persistence';
import type { HorizonSnapshot, Project } from '@/types/project';

/** Larger files are refused before reading them (a backup of hundreds of projects is ~1 MB). */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/** How many validation problems are listed before "and N more". */
const MAX_LISTED_ISSUES = 3;

// ---------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------

export function createBackup(
  projects: readonly Project[],
  now: Date = new Date(),
): HorizonSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    projects: structuredClone([...projects]),
  };
}

/** Pretty-printed so the file is readable and diff-friendly. */
export function serializeBackup(snapshot: HorizonSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

/** E.g. `horizon-backup-2026-11-22.json`, using the local date. */
export function getBackupFileName(now: Date = new Date()): string {
  return `horizon-backup-${getTodayIsoDate(now)}.json`;
}

/** Saves text as a file through a temporary link (no server involved). */
export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType = 'application/json',
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

// ---------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------

/** A backup that cannot be imported, with a pt-BR message ready for the UI. */
export class BackupImportError extends Error {
  override readonly name = 'BackupImportError';

  constructor(
    message: string,
    /** Specific problems, e.g. one line per invalid field. */
    readonly details: readonly string[] = [],
  ) {
    super(message);
  }
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const [root, index, ...rest] = issue.path;
  if (root === 'projects' && typeof index === 'number') {
    const field = rest.filter((part) => typeof part === 'string').join('.');
    return `Projeto ${String(index + 1)}${field ? ` (${field})` : ''}: ${issue.message}`;
  }
  return issue.message;
}

function describeIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  const lines = issues.slice(0, MAX_LISTED_ISSUES).map(describeIssue);
  const remaining = issues.length - MAX_LISTED_ISSUES;
  if (remaining > 0) {
    lines.push(`… e mais ${String(remaining)} ${remaining === 1 ? 'problema' : 'problemas'}.`);
  }
  return lines;
}

/**
 * Parses, migrates and validates a backup. Nothing is partially imported: either the whole
 * file is valid or a `BackupImportError` explains what is wrong.
 */
export function parseBackup(text: string): HorizonSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupImportError('O arquivo não é um JSON válido.');
  }

  try {
    return migrateSnapshot(raw);
  } catch (error) {
    if (error instanceof PersistenceError) {
      const details =
        error.cause instanceof ProjectValidationError ? describeIssues(error.cause.issues) : [];
      const message =
        error.reason === 'unsupported-version'
          ? error.message
          : details.length > 0
            ? 'O arquivo contém projetos inválidos.'
            : 'O arquivo não é um backup do Horizon.';
      throw new BackupImportError(message, details);
    }
    throw error;
  }
}

/** `FileReader` rather than `Blob.text()`, which older engines (and jsdom) lack. */
function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Unable to read the file.'));
    });
    reader.readAsText(file);
  });
}

/** Reads a user-picked file and parses it as a backup. */
export async function readBackupFile(file: File): Promise<HorizonSnapshot> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupImportError('O arquivo é grande demais (máximo de 5 MB).');
  }

  let text: string;
  try {
    text = await readAsText(file);
  } catch {
    throw new BackupImportError('Não foi possível ler o arquivo.');
  }

  return parseBackup(text);
}

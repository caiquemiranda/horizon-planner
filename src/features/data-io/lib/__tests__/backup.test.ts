import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import {
  BackupImportError,
  createBackup,
  downloadTextFile,
  getBackupFileName,
  MAX_BACKUP_BYTES,
  parseBackup,
  readBackupFile,
  serializeBackup,
} from '../backup';

const now = new Date('2026-11-22T15:30:00.000Z');

function expectImportError(run: () => unknown, message: string | RegExp, details?: unknown[]) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BackupImportError);
    expect((error as BackupImportError).message).toMatch(message);
    if (details) expect((error as BackupImportError).details).toEqual(details);
    return;
  }
  throw new Error('Expected parseBackup to throw.');
}

describe('export', () => {
  it('round-trips through serialize and parse', () => {
    const projects = [makeProject({ title: 'Piano' }), makeProject({ category: 'Casa' })];

    const text = serializeBackup(createBackup(projects, now));

    expect(text.endsWith('\n')).toBe(true);
    expect(parseBackup(text)).toEqual({
      schemaVersion: 1,
      exportedAt: '2026-11-22T15:30:00.000Z',
      projects,
    });
  });

  it('copies the projects', () => {
    const project = makeProject();
    const backup = createBackup([project], now);

    expect(backup.projects[0]).not.toBe(project);
  });

  it('names the file after the local date', () => {
    expect(getBackupFileName(now)).toBe('horizon-backup-2026-11-22.json');
  });
});

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicks a temporary link to the content', () => {
    URL.createObjectURL = vi.fn(() => 'blob:backup');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      // jsdom does not navigate.
    });

    downloadTextFile('{}', 'backup.json');

    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('backup.json');
    expect(link.href).toBe('blob:backup');
    expect(link.isConnected).toBe(false);
  });
});

describe('parseBackup', () => {
  it('rejects text that is not JSON', () => {
    expectImportError(() => parseBackup('{ nope'), 'O arquivo não é um JSON válido.');
  });

  it('rejects JSON that is not a backup', () => {
    expectImportError(() => parseBackup('[1, 2, 3]'), 'O arquivo não é um backup do Horizon.');
    expectImportError(() => parseBackup('{"hello":"world"}'), 'não é um backup do Horizon');
  });

  it('rejects backups from a newer version', () => {
    const text = JSON.stringify({ schemaVersion: 99, exportedAt: now.toISOString(), projects: [] });

    expectImportError(() => parseBackup(text), /versão mais nova/);
  });

  it('lists the invalid fields', () => {
    const backup = createBackup(
      [makeProject(), makeProject({ title: '', endDate: '2020-01-01' as ISODate })],
      now,
    );

    expectImportError(
      () => parseBackup(serializeBackup(backup)),
      'O arquivo contém projetos inválidos.',
      [
        'Projeto 2 (title): O título é obrigatório.',
        'Projeto 2 (endDate): A data de término deve ser igual ou posterior à data de início.',
      ],
    );
  });

  it('summarizes long lists of problems', () => {
    const invalid = Array.from({ length: 5 }, () => makeProject({ progress: 300 }));

    try {
      parseBackup(serializeBackup(createBackup(invalid, now)));
    } catch (error) {
      const { details } = error as BackupImportError;
      expect(details).toHaveLength(4);
      expect(details.at(-1)).toBe('… e mais 2 problemas.');
    }
  });
});

describe('readBackupFile', () => {
  it('reads and parses a file', async () => {
    const backup = createBackup([makeProject()], now);
    const file = new File([serializeBackup(backup)], 'backup.json');

    await expect(readBackupFile(file)).resolves.toEqual(backup);
  });

  it('refuses files that are too large', async () => {
    const file = new File(['x'], 'big.json');
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_BYTES + 1 });

    await expect(readBackupFile(file)).rejects.toThrow('O arquivo é grande demais');
  });
});

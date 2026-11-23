import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
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
      schemaVersion: 2,
      exportedAt: '2026-11-22T15:30:00.000Z',
      projects,
      schedules: [],
    });
  });

  it('includes the schedules of exported projects only', () => {
    const project = makeProject();
    const schedule = createIndustrialSchedule({
      projectId: project.id,
      start: '2026-11-23' as ISODate,
      generateId: (key) => `id-${key}`,
      now,
    });
    const orphan = { ...schedule, projectId: 'deleted-project' };

    const backup = createBackup([project], now, [schedule, orphan]);
    expect(backup.schedules).toEqual([schedule]);
    expect(parseBackup(serializeBackup(backup)).schedules).toEqual([schedule]);
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

describe('parseBackup with schedules', () => {
  const project = makeProject();
  const schedule = createIndustrialSchedule({
    projectId: project.id,
    start: '2026-11-23' as ISODate,
    generateId: (key) => `id-${key}`,
    now,
  });

  it('accepts backups made before schedules existed', () => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      exportedAt: now.toISOString(),
      projects: [project],
    });
    expect(parseBackup(legacy).schedules).toEqual([]);
  });

  it('lists invalid schedules', () => {
    const text = serializeBackup({
      ...createBackup([project], now),
      schedules: [{ ...schedule, calendar: { workingWeekdays: [], holidays: [] } }],
    });
    expectImportError(() => parseBackup(text), 'O arquivo contém cronogramas inválidos.', [
      expect.stringMatching(/^Cronograma 1: /),
    ]);
  });

  it('refuses schedules of projects that are not in the file', () => {
    const text = serializeBackup({
      ...createBackup([project], now),
      schedules: [{ ...schedule, projectId: 'other' }],
    });
    expectImportError(() => parseBackup(text), 'O arquivo contém cronogramas inválidos.', [
      'Há um cronograma de um projeto que não está no arquivo.',
    ]);
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

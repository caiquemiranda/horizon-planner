import { describe, expect, it, vi } from 'vitest';

import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { getProjectSyncPatch } from '@/features/schedule/lib/portfolioSync';
import { readXlsx } from '@/lib/spreadsheet/xlsxReader';
import { writeXlsx } from '@/lib/spreadsheet/xlsxWriter';
import { InMemoryRepository, InMemoryScheduleRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import type { ISODate, UUID } from '@/types/project';

import {
  buildImportDraft,
  createImportCommitter,
  getImportFingerprint,
  IMPORT_FINGERPRINTS_KEY,
  type ImportCommitDependencies,
  ImportCommitError,
} from '../wbsCommit';
import { buildImportPreview } from '../wbsImport';
import { buildProjectWorkbook } from '../wbsWorkbook';

const TODAY = '2026-11-23' as ISODate;
let counter = 0;
const generateId = () => `n-${String((counter += 1))}`;

function exportedProject() {
  const project = makeProject({ title: 'Implantação SDAI', category: 'Obras' });
  const schedule = createIndustrialSchedule({
    projectId: project.id,
    start: TODAY,
    generateId: (key) => `k-${key}`,
  });
  const plan = computeSchedule(schedule);
  const bytes = writeXlsx(buildProjectWorkbook(project, schedule, plan, null));
  return { project, schedule, plan, bytes };
}

function previewOf(bytes: Uint8Array) {
  return buildImportPreview(
    { kind: 'xlsx', workbook: readXlsx(bytes), fileName: 'sdai.xlsx' },
    { today: TODAY, generateId },
  );
}

function setup(overrides: Partial<ImportCommitDependencies> = {}) {
  const projects = new InMemoryRepository();
  const schedules = new InMemoryScheduleRepository();
  const removed = new Set<UUID>();
  const dependencies: ImportCommitDependencies = {
    createProject: (draft) => projects.create(draft),
    saveSchedule: (schedule) => schedules.save(schedule, 0),
    removeProject: async (id) => {
      removed.add(id);
      await projects.remove(id);
    },
    projectExists: (id) => !removed.has(id),
    storage: window.localStorage,
    ...overrides,
  };
  return { projects, schedules, removed, committer: createImportCommitter(dependencies) };
}

describe('import commit', () => {
  it('creates the project, then its schedule, and round-trips the exported plan', async () => {
    window.localStorage.clear();
    const { project: original, schedule, plan, bytes } = exportedProject();
    const preview = previewOf(bytes);
    const { projects, schedules, committer } = setup();

    const result = await committer.commit(preview, getImportFingerprint(bytes, null, {}), TODAY);
    expect(result.status).toBe('created');
    if (result.status !== 'created') return;
    expect(result.counts).toEqual(preview.counts);

    const [saved] = await projects.list();
    expect(saved).toMatchObject({
      id: result.project.id,
      title: 'Implantação SDAI',
      category: 'Obras',
      status: 'planned',
      milestones: [],
    });
    const stored = await schedules.get(result.project.id);
    expect(stored?.revision).toBe(1);
    expect(stored?.tasks).toHaveLength(schedule.tasks.length);
    expect(stored?.dependencies).toHaveLength(schedule.dependencies.length);

    // The stored schedule plans the same dates, and the project already matches it.
    if (!stored) throw new Error('schedule not saved');
    const replanned = computeSchedule(stored);
    expect(replanned.range).toEqual(plan.range);
    expect(getProjectSyncPatch(saved ?? original, replanned)).toBeNull();
  });

  it('removes the project when the schedule cannot be saved (nothing half imported)', async () => {
    window.localStorage.clear();
    const { bytes } = exportedProject();
    const preview = previewOf(bytes);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { projects, committer } = setup({
      saveSchedule: () => Promise.reject(new Error('quota')),
    });
    const fingerprint = getImportFingerprint(bytes, null, {});

    await expect(committer.commit(preview, fingerprint, TODAY)).rejects.toBeInstanceOf(
      ImportCommitError,
    );
    expect(await projects.list()).toEqual([]);
    // A failed import leaves no fingerprint behind, so it can be retried.
    expect(window.localStorage.getItem(IMPORT_FINGERPRINTS_KEY)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('creates one project for a double click, a retry or the same file again', async () => {
    window.localStorage.clear();
    const { bytes } = exportedProject();
    const fingerprint = getImportFingerprint(bytes, null, {});
    const { projects, committer } = setup();

    // Double click: both calls share the write in progress.
    const [first, second] = await Promise.all([
      committer.commit(previewOf(bytes), fingerprint, TODAY),
      committer.commit(previewOf(bytes), fingerprint, TODAY),
    ]);
    expect(second).toEqual(first);

    // Later, even from another committer (a reload), the same file opens that project.
    const again = await setup().committer.commit(previewOf(bytes), fingerprint, TODAY);
    expect(again).toEqual({
      status: 'duplicate',
      projectId: first.status === 'created' ? first.project.id : '',
    });
    expect(await projects.list()).toHaveLength(1);
  });

  it('imports again once the first project is gone, or with other columns', async () => {
    window.localStorage.clear();
    const { bytes } = exportedProject();
    const fingerprint = getImportFingerprint(bytes, null, {});
    const { projects, removed, committer } = setup();

    const first = await committer.commit(previewOf(bytes), fingerprint, TODAY);
    if (first.status === 'created') removed.add(first.project.id);
    const second = await committer.commit(previewOf(bytes), fingerprint, TODAY);
    expect(second.status).toBe('created');

    const remapped = getImportFingerprint(bytes, 'EAP_Tarefas', { nome: 1 });
    expect(remapped).not.toBe(fingerprint);
    expect(getImportFingerprint(bytes.slice(0, -1), null, {})).not.toBe(fingerprint);
    expect(await projects.list()).toHaveLength(2);
  });

  it('refuses a preview with blocking errors without writing', async () => {
    const preview = buildImportPreview(
      {
        kind: 'csv',
        rows: [
          ['nome', 'duracao_dias_uteis'],
          ['', '-1'],
        ],
        fileName: 'x.csv',
      },
      { today: TODAY, generateId },
    );
    const createProject = vi.fn();
    const { committer } = setup({ createProject });
    await expect(committer.commit(preview, 'x', TODAY)).rejects.toBeInstanceOf(ImportCommitError);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('dates the project from its schedule and suggests the horizon', () => {
    const { bytes, plan } = exportedProject();
    const draft = buildImportDraft(previewOf(bytes), TODAY);
    expect(draft.startDate).toBe(TODAY);
    expect(draft.endDate > draft.startDate).toBe(true);
    expect(draft.progress).toBe(plan.progress);
    expect(['short', 'medium', 'long']).toContain(draft.horizon);
  });
});

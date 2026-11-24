import { describe, expect, it } from 'vitest';

import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { computeForecast } from '@/features/schedule/lib/forecast';
import { type Cell, isDateCell } from '@/lib/spreadsheet/cells';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import {
  buildProjectWorkbook,
  buildTasksCsvRows,
  buildTemplateWorkbook,
  formatLinkReference,
  getWbsFileName,
  LINK_COLUMNS,
  SHEETS,
  TASK_COLUMNS,
} from '../wbsWorkbook';

const project = makeProject({ title: 'Implantação SDAI' });
const schedule = createIndustrialSchedule({
  projectId: project.id,
  start: '2026-11-23' as ISODate,
  generateId: (key) => `k-${key}`,
});
const plan = computeSchedule(schedule);
const forecast = computeForecast(schedule, plan, '2026-11-23' as ISODate);

const column = (key: string) => TASK_COLUMNS.findIndex((item) => item.key === key);
const valueOf = (row: Cell[] | undefined, key: string) => row?.[column(key)];

function sheet(name: string) {
  const found = buildProjectWorkbook(project, schedule, plan, forecast).find(
    (item) => item.name === name,
  );
  if (!found) throw new Error(name);
  return found;
}

describe('project workbook', () => {
  it('has the documented sheets in order', () => {
    expect(
      buildProjectWorkbook(project, schedule, plan, forecast).map((item) => item.name),
    ).toEqual([SHEETS.instructions, SHEETS.project, SHEETS.tasks, SHEETS.links, SHEETS.calendar]);
  });

  it('lists every task in WBS order, whatever is collapsed on screen', () => {
    const { rows } = sheet(SHEETS.tasks);
    expect(rows[0]).toEqual(TASK_COLUMNS.map((item) => item.key));
    expect(rows).toHaveLength(schedule.tasks.length + 1);
    expect(rows.slice(1, 4).map((row) => valueOf(row, 'codigo_eap'))).toEqual(['1', '1.1', '1.2']);
  });

  it('writes summaries without duration and with their rolled-up progress', () => {
    const { rows } = sheet(SHEETS.tasks);
    const summary = rows[1];
    expect(valueOf(summary, 'tipo')).toBe('Resumo');
    expect(valueOf(summary, 'duracao_dias_uteis')).toBeNull();
    expect(valueOf(summary, 'codigo_pai')).toBeNull();
    const child = rows[2];
    expect(valueOf(child, 'tipo')).toBe('Tarefa');
    expect(valueOf(child, 'codigo_pai')).toBe(valueOf(summary, 'codigo_externo'));
    expect(valueOf(child, 'inicio_planejado')).toEqual({ date: '2026-11-23' });
    const milestone = rows.find((row) => valueOf(row, 'tipo') === 'Marco');
    expect(valueOf(milestone, 'duracao_dias_uteis')).toBe(0);
  });

  it('keeps planned, forecast and actual values in separate columns', () => {
    const { rows } = sheet(SHEETS.tasks);
    const first = rows[2];
    expect(isDateCell(valueOf(first, 'termino_planejado') ?? null)).toBe(true);
    expect(isDateCell(valueOf(first, 'termino_previsto') ?? null)).toBe(true);
    expect(valueOf(first, 'inicio_real')).toBeNull();
  });

  it('writes every link with its type and lag, referring to stable codes', () => {
    const { rows } = sheet(SHEETS.links);
    expect(rows[0]).toEqual(LINK_COLUMNS.map((item) => item.key));
    expect(rows).toHaveLength(schedule.dependencies.length + 1);
    const codes = new Set(schedule.tasks.map((task) => task.id));
    for (const row of rows.slice(1)) {
      expect(codes.has(row[0] as string)).toBe(true);
      expect(codes.has(row[1] as string)).toBe(true);
      expect(['FS', 'SS', 'FF', 'SF']).toContain(row[2]);
    }
  });

  it('writes the calendar working days and holidays', () => {
    const calendar = sheet(SHEETS.calendar);
    expect(calendar.rows[1]).toEqual(['dias_uteis', 'seg,ter,qua,qui,sex']);
  });
});

describe('tasks CSV', () => {
  it('carries the links in the predecessoras column', () => {
    const rows = buildTasksCsvRows(schedule, plan, forecast);
    const link = schedule.dependencies[0];
    if (!link) throw new Error('fixture without links');
    const successor = rows.find((row) => valueOf(row, 'codigo_externo') === link.successorId);
    expect(valueOf(successor, 'predecessoras')).toEqual(
      expect.stringContaining(link.predecessorId),
    );
  });

  it('formats link references compactly', () => {
    expect(formatLinkReference('LEV', 'FS', 0)).toBe('LEV');
    expect(formatLinkReference('LEV', 'SS', 2)).toBe('LEV:SS+2');
    expect(formatLinkReference('LEV', 'FF', -1)).toBe('LEV:FF-1');
  });
});

describe('template', () => {
  const template = buildTemplateWorkbook();

  it('leaves the importable sheets empty and the example apart', () => {
    const tasks = template.find((item) => item.name === SHEETS.tasks);
    expect(tasks?.rows).toEqual([TASK_COLUMNS.map((item) => item.key)]);
    const example = template.find((item) => item.name === SHEETS.example);
    expect(example?.rows.some((row) => row.includes('Aceite final'))).toBe(true);
  });

  it('documents every column in the instructions', () => {
    const instructions = template.find((item) => item.name === SHEETS.instructions);
    const documented = new Set(instructions?.rows.map((row) => row[0]));
    for (const item of [...TASK_COLUMNS, ...LINK_COLUMNS])
      expect(documented.has(item.key)).toBe(true);
  });
});

describe('file names', () => {
  it('are safe and dated', () => {
    const now = new Date(2026, 10, 23);
    expect(getWbsFileName('Implantação: SDAI / fase 2', 'xlsx', now)).toBe(
      'horizon-eap-implantacao-sdai-fase-2-2026-11-23.xlsx',
    );
    expect(getWbsFileName(null, 'xlsx', now)).toBe('horizon-eap-modelo-2026-11-23.xlsx');
  });
});

import { describe, expect, it } from 'vitest';

import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { computeForecast } from '@/features/schedule/lib/forecast';
import { buildTreeIndex, getWbsNumbers } from '@/features/schedule/lib/tree';
import type { Cell } from '@/lib/spreadsheet/cells';
import { readCsv } from '@/lib/spreadsheet/csvReader';
import { writeCsv } from '@/lib/spreadsheet/csvWriter';
import { type ReadWorkbook, readXlsx } from '@/lib/spreadsheet/xlsxReader';
import { writeXlsx } from '@/lib/spreadsheet/xlsxWriter';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import {
  buildImportPreview,
  type ImportPreview,
  parseDate,
  parseLinkReference,
  suggestMapping,
} from '../wbsImport';
import {
  buildProjectWorkbook,
  buildTasksCsvRows,
  buildTemplateWorkbook,
  TASK_COLUMNS,
} from '../wbsWorkbook';

const TODAY = '2026-11-23' as ISODate;
let counter = 0;
const options = { today: TODAY, generateId: () => `n-${String((counter += 1))}` };

function workbook(
  tasks: Cell[][],
  links: Cell[][] = [],
  extra: { name: string; rows: Cell[][] }[] = [],
) {
  return readXlsx(
    writeXlsx([
      {
        name: 'Projeto',
        rows: [
          ['campo', 'valor'],
          ['nome', 'Obra teste'],
          ['inicio', { date: '2027-03-01' as ISODate }],
        ],
      },
      { name: 'EAP_Tarefas', rows: [TASK_COLUMNS.map((column) => column.key), ...tasks] },
      {
        name: 'Dependências',
        rows: [['predecessora', 'sucessora', 'tipo', 'defasagem_dias_uteis'], ...links],
      },
      ...extra,
    ]),
  );
}

/** A task row in the template's column order (only the first nine columns). */
const row = (
  code: string,
  parent: string | null,
  name: string,
  kind: string,
  duration: number | null,
  start: Cell = null,
): Cell[] => [code, null, parent, null, name, kind, null, duration, start];

const preview = (source: ReadWorkbook, fileName = 'obra.xlsx') =>
  buildImportPreview({ kind: 'xlsx', workbook: source, fileName }, options);

const errors = (result: ImportPreview) =>
  result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);

describe('buildImportPreview', () => {
  it('imports 3 levels, milestones and FS links into a coherent schedule', () => {
    const result = preview(
      workbook(
        [
          row('ENG', null, 'Engenharia', 'Resumo', null),
          row('LEV', 'ENG', 'Levantamento', 'Resumo', null),
          row('LEV1', 'LEV', 'Visita técnica', 'Tarefa', 2, { date: '2027-03-01' as ISODate }),
          row('LEV2', 'LEV', 'Relatório', 'Tarefa', 3),
          row('PROJ', 'ENG', 'Projeto', 'Tarefa', 4),
          row('ACEITE', null, 'Aceite', 'Marco', 0),
        ],
        [
          ['LEV1', 'LEV2', 'FS', 0],
          ['LEV2', 'PROJ', null, null],
          ['PROJ', 'ACEITE', 'FS', 1],
        ],
      ),
    );
    expect(errors(result)).toEqual([]);
    expect(result.canImport).toBe(true);
    expect(result.project.title).toBe('Obra teste');
    expect(result.counts).toEqual({ summaries: 2, tasks: 3, milestones: 1, links: 3 });
    const index = buildTreeIndex(result.schedule.tasks);
    const wbs = getWbsNumbers(index);
    const byName = (name: string) => result.schedule.tasks.find((task) => task.name === name);
    expect(wbs.get(byName('Visita técnica')?.id ?? '')).toBe('1.1.1');
    // Scheduling: 2 days from Monday 1 Mar, then 3, then 4, then a lag of 1 day.
    expect(result.result.range).not.toBeNull();
    const aceite = result.result.tasks.get(byName('Aceite')?.id ?? '');
    expect(aceite?.kind).toBe('milestone');
    // Tasks without a start begin on the project start, announced as a warning.
    expect(result.issues.some((issue) => issue.message.includes('sem início'))).toBe(true);
  });

  it('round-trips an exported project: same tree, links and calendar, new identities', () => {
    const project = makeProject({ title: 'Implantação' });
    const schedule = createIndustrialSchedule({
      projectId: project.id,
      start: TODAY,
      generateId: (key) => `k-${key}`,
    });
    const plan = computeSchedule(schedule);
    const exported = readXlsx(
      writeXlsx(
        buildProjectWorkbook(project, schedule, plan, computeForecast(schedule, plan, TODAY)),
      ),
    );
    const result = preview(exported);
    expect(errors(result)).toEqual([]);
    expect(result.project.title).toBe('Implantação');
    expect(result.schedule.tasks).toHaveLength(schedule.tasks.length);
    expect(result.schedule.dependencies).toHaveLength(schedule.dependencies.length);
    // Same WBS outline and names, recalculated dates equal to the plan.
    const wbsOf = (tasks: typeof schedule.tasks) => {
      const numbers = getWbsNumbers(buildTreeIndex(tasks));
      return tasks.map((task) => `${numbers.get(task.id) ?? ''} ${task.name}`).sort();
    };
    expect(wbsOf(result.schedule.tasks)).toEqual(wbsOf(schedule.tasks));
    expect(result.result.range).toEqual(plan.range);
    // New internal identities.
    expect(result.schedule.tasks.some((task) => task.id.startsWith('k-'))).toBe(false);
  });

  it('round-trips the CSV export, with links in the predecessoras column', () => {
    const project = makeProject({ title: 'CSV' });
    const schedule = createIndustrialSchedule({
      projectId: project.id,
      start: TODAY,
      generateId: (key) => `c-${key}`,
    });
    const plan = computeSchedule(schedule);
    const csv = readCsv(
      new TextEncoder().encode(writeCsv(buildTasksCsvRows(schedule, plan, null))),
    );
    const result = buildImportPreview(
      { kind: 'csv', rows: csv.rows, fileName: 'csv.csv' },
      options,
    );
    expect(errors(result)).toEqual([]);
    expect(result.schedule.dependencies).toHaveLength(schedule.dependencies.length);
    expect(result.project.title).toBe('csv');
  });

  it('reads an ordinary spreadsheet: free headers, WBS codes for the hierarchy, Brazilian dates', () => {
    const rows = [
      ['EAP', 'Nome da tarefa', 'Duração', 'Início', 'Responsável'],
      ['1', 'Mudança', '', '', ''],
      ['1.1', 'Embalar', '2', '03/05/2027', 'Ana'],
      ['1.2', 'Transportar', '1', '', 'Bruno'],
    ];
    expect(suggestMapping(rows[0] ?? [])).toEqual({
      codigo_eap: 0,
      nome: 1,
      duracao_dias_uteis: 2,
      inicio_planejado: 3,
      responsavel: 4,
    });
    const result = buildImportPreview({ kind: 'csv', rows, fileName: 'mudanca.csv' }, options);
    expect(errors(result)).toEqual([]);
    expect(result.counts).toMatchObject({ summaries: 1, tasks: 2 });
    expect(result.schedule.tasks.find((task) => task.name === 'Embalar')).toMatchObject({
      start: '2027-05-03',
      assignee: 'Ana',
    });
  });

  it.each([
    ['a missing parent', [row('A', 'X', 'A', 'Tarefa', 1)], [], /Pai “X” não existe/],
    [
      'a duplicated code',
      [row('A', null, 'A', 'Tarefa', 1), row('A', null, 'B', 'Tarefa', 1)],
      [],
      /Código “A” repetido/,
    ],
    ['a row that is its own parent', [row('A', 'A', 'A', 'Tarefa', 1)], [], /pai de si mesma/],
    [
      'a hierarchy cycle',
      [row('A', 'B', 'A', 'Tarefa', 1), row('B', 'A', 'B', 'Tarefa', 1)],
      [],
      /ciclo/,
    ],
    ['an empty name', [row('A', null, '', 'Tarefa', 1)], [], /Nome vazio/],
    ['an unknown kind', [row('A', null, 'A', 'Fase X', 1)], [], /Tipo “Fase X” desconhecido/],
    ['a negative duration', [row('A', null, 'A', 'Tarefa', -2)], [], /Duração deve ser/],
    ['a task without duration', [row('A', null, 'A', 'Tarefa', null)], [], /Duração obrigatória/],
    ['an invalid date', [row('A', null, 'A', 'Tarefa', 1, '31/02/2027')], [], /Data inválida/],
    [
      'a summary without subtasks',
      [row('A', null, 'A', 'Resumo', null)],
      [],
      /Resumo sem subtarefas/,
    ],
    [
      'a link to an unknown code',
      [row('A', null, 'A', 'Tarefa', 1)],
      [['A', 'Z', 'FS', 0]],
      /código inexistente: “Z”/,
    ],
    [
      'a self link',
      [row('A', null, 'A', 'Tarefa', 1)],
      [['A', 'A', 'FS', 0]],
      /depender dela mesma/,
    ],
    [
      'an unknown link type',
      [row('A', null, 'A', 'Tarefa', 1), row('B', null, 'B', 'Tarefa', 1)],
      [['A', 'B', 'XX', 0]],
      /Tipo de vínculo “XX”/,
    ],
    [
      'a link to a summary',
      [
        row('P', null, 'P', 'Resumo', null),
        row('A', 'P', 'A', 'Tarefa', 1),
        row('B', null, 'B', 'Tarefa', 1),
      ],
      [['P', 'B', 'FS', 0]],
      /não resumos/,
    ],
    [
      'a link cycle',
      [row('A', null, 'A', 'Tarefa', 1), row('B', null, 'B', 'Tarefa', 1)],
      [
        ['A', 'B', 'FS', 0],
        ['B', 'A', 'SS', 0],
      ],
      /sentido oposto: isso formaria um ciclo/,
    ],
  ] as [string, Cell[][], Cell[][], RegExp][])(
    'blocks %s with a message by row',
    (_case, tasks, links, message) => {
      const result = preview(workbook(tasks, links));
      expect(result.canImport).toBe(false);
      // A blocking error with that message, located by sheet and row when it has one.
      const issue = result.issues.find(
        (item) => item.severity === 'error' && message.test(item.message),
      );
      expect(issue).toBeDefined();
      expect(issue?.sheet).not.toBeUndefined();
    },
  );

  it('detects a real link cycle through three tasks', () => {
    const result = preview(
      workbook(
        [
          row('A', null, 'A', 'Tarefa', 1),
          row('B', null, 'B', 'Tarefa', 1),
          row('C', null, 'C', 'Tarefa', 1),
        ],
        [
          ['A', 'B', 'FS', 0],
          ['B', 'C', 'FS', 0],
          ['C', 'A', 'FS', 0],
        ],
      ),
    );
    expect(
      errors(result).some((message) => message.includes('formam um ciclo entre: A, B, C')),
    ).toBe(true);
  });

  it('blocks a sheet without a name column and an empty template', () => {
    const noName = buildImportPreview(
      {
        kind: 'csv',
        rows: [
          ['x', 'y'],
          ['1', '2'],
        ],
        fileName: 'x.csv',
      },
      options,
    );
    expect(errors(noName)).toContain('Nenhuma coluna foi associada ao nome das tarefas.');
    const template = preview(readXlsx(writeXlsx(buildTemplateWorkbook())), 'modelo.xlsx');
    expect(errors(template)).toContain('Nenhuma tarefa encontrada na planilha.');
    // The example sheet is never the one imported.
    expect(template.tasksSheet).toBe('EAP_Tarefas');
  });

  it('turns a task with subtasks into a summary, with a warning', () => {
    const result = preview(
      workbook([row('A', null, 'A', 'Tarefa', 3), row('B', 'A', 'B', 'Tarefa', 1)]),
    );
    expect(result.canImport).toBe(true);
    expect(
      result.issues.some((issue) => issue.message.includes('Tem subtarefas: será um resumo')),
    ).toBe(true);
  });
});

describe('value parsing', () => {
  it('reads dates in the documented formats only', () => {
    expect(parseDate('2027-03-01')).toBe('2027-03-01');
    expect(parseDate('3/4/2027')).toBe('2027-04-03');
    expect(parseDate({ date: '2027-03-01' as ISODate })).toBe('2027-03-01');
    expect(parseDate('')).toBeNull();
    expect(parseDate('2027-02-30')).toBe('invalid');
    expect(parseDate('amanhã')).toBe('invalid');
  });

  it('reads compact link references', () => {
    expect(parseLinkReference('LEV')).toEqual({ code: 'LEV', type: 'FS', lag: 0 });
    expect(parseLinkReference('PROJ:ss+2')).toEqual({ code: 'PROJ', type: 'SS', lag: 2 });
    expect(parseLinkReference('X:FF-1')).toEqual({ code: 'X', type: 'FF', lag: -1 });
    // Ids with hyphens and digits are codes, not lags.
    const id = '8c190f7d-06e8-4c8a-8ac5-215480252194';
    expect(parseLinkReference(id)).toEqual({ code: id, type: 'FS', lag: 0 });
    expect(parseLinkReference(`${id}:FS+2`)).toEqual({ code: id, type: 'FS', lag: 2 });
    // The short form only when the rest is a known code.
    expect(parseLinkReference('LEV+2', new Set(['LEV']))).toEqual({
      code: 'LEV',
      type: 'FS',
      lag: 2,
    });
  });
});

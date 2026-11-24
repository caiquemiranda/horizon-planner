import { WEEKDAY_LABELS } from '@/features/schedule/lib/calendar';
import { getDisplayFinish } from '@/features/schedule/lib/engine';
import type { ScheduleForecast } from '@/features/schedule/lib/forecast';
import { buildTreeIndex, getTasksInWbsOrder, getWbsNumbers } from '@/features/schedule/lib/tree';
import { dayToIsoDate, getTodayIsoDate } from '@/features/timeline/lib/time';
import type { Cell, Sheet } from '@/lib/spreadsheet/cells';
import type { ISODate, Project } from '@/types/project';
import type {
  DependencyType,
  ProjectSchedule,
  ScheduleResult,
  TaskDependency,
  Weekday,
} from '@/types/schedule';

/**
 * The WBS spreadsheet contract, shared by the export, the template and (next) the import.
 *
 * - `codigo_externo` identifies a row for the whole file: parents and links refer to it.
 *   The WBS code (`1.2.3`) is only an address that changes when tasks move.
 * - Being a child of a task never means depending on it: links are in `Dependências`
 *   (or, in the single-sheet CSV, in the `predecessoras` column).
 * - Summary dates and progress are derived from their subtasks; on import they are
 *   recalculated, never taken as truth.
 * - Columns marked "somente exportação" carry calculated or actual values for reading;
 *   the import ignores them and recalculates.
 */

export const WBS_TEMPLATE_VERSION = 1;

export const SHEETS = {
  instructions: 'Instruções',
  project: 'Projeto',
  tasks: 'EAP_Tarefas',
  links: 'Dependências',
  calendar: 'Calendário',
  example: 'Exemplo',
} as const;

export interface ColumnSpec {
  key: string;
  /** What it means and how to fill it, in pt-BR (Instruções sheet). */
  help: string;
  required?: boolean;
  /** Written for reading; ignored by the import. */
  exportOnly?: boolean;
  width: number;
}

export const TASK_COLUMNS: readonly ColumnSpec[] = [
  {
    key: 'codigo_externo',
    help: 'Identificador único da linha (ex.: LEV). Usado por codigo_pai e pelos vínculos.',
    required: true,
    width: 16,
  },
  {
    key: 'codigo_eap',
    help: 'Número EAP visível (1, 1.1, 1.1.1). Recalculado na importação.',
    width: 10,
  },
  {
    key: 'codigo_pai',
    help: 'codigo_externo da linha pai; vazio para itens de primeiro nível.',
    width: 16,
  },
  { key: 'ordem', help: 'Posição entre irmãos (1, 2, 3…). Vazio: ordem das linhas.', width: 8 },
  { key: 'nome', help: 'Nome da fase, tarefa ou marco.', required: true, width: 36 },
  {
    key: 'tipo',
    help: 'Resumo, Tarefa ou Marco. Resumo precisa de subtarefas; Marco tem duração 0.',
    required: true,
    width: 10,
  },
  { key: 'descricao', help: 'Observações da tarefa (opcional).', width: 30 },
  {
    key: 'duracao_dias_uteis',
    help: 'Dias úteis (número inteiro ≥ 0). Ignorado para Resumo; 0 para Marco.',
    width: 12,
  },
  {
    key: 'inicio_planejado',
    help: 'Data de início pedida (dd/mm/aaaa ou aaaa-mm-dd). O motor respeita vínculos e calendário.',
    width: 14,
  },
  {
    key: 'termino_planejado',
    help: 'Somente exportação: término do plano, calculado.',
    exportOnly: true,
    width: 14,
  },
  { key: 'responsavel', help: 'Pessoa ou equipe (texto livre).', width: 18 },
  {
    key: 'modo',
    help: 'Automático (o motor agenda) ou Manual (fica onde foi posto). Vazio: Automático.',
    width: 12,
  },
  {
    key: 'percentual',
    help: 'Progresso de 0 a 100 para tarefas e marcos (marco: 0 ou 100). Ignorado para Resumo.',
    width: 10,
  },
  {
    key: 'predecessoras',
    help: 'Somente no CSV (no Excel use a aba Dependências): codigo_externo[:TIPO[+/-dias]], separados por vírgula. Ex.: LEV, PROJ:SS+2, COMP:FS-1.',
    width: 22,
  },
  {
    key: 'termino_previsto',
    help: 'Somente exportação: previsão de término pelo trabalho restante.',
    exportOnly: true,
    width: 14,
  },
  {
    key: 'inicio_real',
    help: 'Somente exportação: primeiro dia de trabalho confirmado.',
    exportOnly: true,
    width: 14,
  },
  {
    key: 'termino_real',
    help: 'Somente exportação: dia em que o trabalho foi concluído.',
    exportOnly: true,
    width: 14,
  },
  {
    key: 'trabalho_concluido_dias',
    help: 'Somente exportação: dias úteis de trabalho já feitos.',
    exportOnly: true,
    width: 12,
  },
];

export const LINK_COLUMNS: readonly ColumnSpec[] = [
  {
    key: 'predecessora',
    help: 'codigo_externo da tarefa que vem antes.',
    required: true,
    width: 16,
  },
  {
    key: 'sucessora',
    help: 'codigo_externo da tarefa que depende dela.',
    required: true,
    width: 16,
  },
  {
    key: 'tipo',
    help: 'FS (término→início), SS (início→início), FF (término→término) ou SF (início→término). Vazio: FS.',
    width: 8,
  },
  {
    key: 'defasagem_dias_uteis',
    help: 'Dias úteis de espera (positivo) ou antecipação (negativo). Vazio: 0.',
    width: 12,
  },
];

export const KIND_LABELS = { summary: 'Resumo', task: 'Tarefa', milestone: 'Marco' } as const;
export const MODE_LABELS = { auto: 'Automático', manual: 'Manual' } as const;

const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * `codigo_externo[:TIPO[+/-dias]]`, the compact form of a link. The lag always comes after
 * the type, so codes containing hyphens and digits (such as ids) are never misread.
 */
export function formatLinkReference(code: string, type: DependencyType, lag: number): string {
  if (lag === 0) return type === 'FS' ? code : `${code}:${type}`;
  return `${code}:${type}${lag > 0 ? '+' : ''}${String(lag)}`;
}

function instructionsSheet(): Sheet {
  const rows: Cell[][] = [
    ['Modelo de EAP do Horizon', `versão ${String(WBS_TEMPLATE_VERSION)}`],
    [],
    ['Como preencher'],
    ['1. Aba Projeto: nome do projeto (obrigatório) e dados opcionais.'],
    [
      '2. Aba EAP_Tarefas: uma linha por fase, tarefa ou marco. Use codigo_externo único e codigo_pai para a hierarquia.',
    ],
    [
      '3. Aba Dependências: os vínculos entre tarefas (não entre fases). A hierarquia não cria vínculos.',
    ],
    ['4. Aba Calendário: dias úteis e feriados (opcional; vazio usa segunda a sexta).'],
    ['5. A aba Exemplo mostra um preenchimento possível e nunca é importada.'],
    [],
    ['Regras'],
    ['- Datas e progresso de fases são calculados a partir das subtarefas.'],
    ['- Marco tem duração 0 e aparece como losango no Gantt.'],
    ['- Fórmulas e macros não são executadas; células com fórmula são lidas como o valor exibido.'],
    ['- Valores vazios nunca viram 0%, concluído ou a data de hoje sem aviso.'],
    [],
    ['Colunas de EAP_Tarefas', 'Obrigatória', 'Significado'],
    ...TASK_COLUMNS.map((column): Cell[] => [
      column.key,
      column.required ? 'sim' : '',
      column.help,
    ]),
    [],
    ['Colunas de Dependências', 'Obrigatória', 'Significado'],
    ...LINK_COLUMNS.map((column): Cell[] => [
      column.key,
      column.required ? 'sim' : '',
      column.help,
    ]),
  ];
  return { name: SHEETS.instructions, rows, widths: [28, 12, 100] };
}

function calendarSheet(schedule: Pick<ProjectSchedule, 'calendar'> | null): Sheet {
  const weekdays = schedule?.calendar.workingWeekdays ?? [1, 2, 3, 4, 5];
  return {
    name: SHEETS.calendar,
    header: true,
    widths: [18, 30],
    rows: [
      ['campo', 'valor'],
      [
        'dias_uteis',
        WEEKDAY_ORDER.filter((day) => weekdays.includes(day))
          .map((day) => WEEKDAY_LABELS[day].short.toLowerCase())
          .join(','),
      ],
      [],
      ['feriado_data', 'feriado_nome'],
      ...(schedule?.calendar.holidays ?? []).map((holiday): Cell[] => [
        { date: holiday.date },
        holiday.name,
      ]),
    ],
  };
}

function header(columns: readonly ColumnSpec[]): Cell[] {
  return columns.map((column) => column.key);
}

function widths(columns: readonly ColumnSpec[]): number[] {
  return columns.map((column) => column.width);
}

/** Rows of `EAP_Tarefas` for a project, in WBS order, every level included. */
export function buildTaskRows(
  schedule: ProjectSchedule,
  plan: ScheduleResult,
  forecast: ScheduleForecast | null,
  options: { inlinePredecessors: boolean },
): Cell[][] {
  const index = buildTreeIndex(schedule.tasks);
  const wbs = getWbsNumbers(index);
  const incoming = new Map<string, TaskDependency[]>();
  for (const link of schedule.dependencies) {
    incoming.set(link.successorId, [...(incoming.get(link.successorId) ?? []), link]);
  }
  return getTasksInWbsOrder(index).map((task) => {
    const scheduled = plan.tasks.get(task.id);
    const kind = scheduled?.kind ?? 'task';
    const isSummary = kind === 'summary';
    const predicted = forecast?.tasks.get(task.id);
    const values: Record<string, Cell> = {
      codigo_externo: task.id,
      codigo_eap: wbs.get(task.id) ?? '',
      codigo_pai: task.parentId,
      ordem: task.order + 1,
      nome: task.name,
      tipo: KIND_LABELS[kind],
      descricao: task.notes || null,
      duracao_dias_uteis: isSummary ? null : task.duration,
      inicio_planejado: scheduled ? { date: dayToIsoDate(scheduled.start) } : { date: task.start },
      termino_planejado: scheduled ? { date: dayToIsoDate(getDisplayFinish(scheduled)) } : null,
      responsavel: task.assignee,
      modo: MODE_LABELS[task.mode],
      percentual: isSummary ? (scheduled?.progress ?? null) : task.progress,
      predecessoras: options.inlinePredecessors
        ? (incoming.get(task.id) ?? [])
            .map((link) => formatLinkReference(link.predecessorId, link.type, link.lag))
            .join(', ') || null
        : null,
      termino_previsto: predicted ? { date: dayToIsoDate(getDisplayFinish(predicted)) } : null,
      inicio_real: task.actualStart ? { date: task.actualStart } : null,
      termino_real: task.actualFinish ? { date: task.actualFinish } : null,
      trabalho_concluido_dias: isSummary ? null : task.completedWork,
    };
    return TASK_COLUMNS.map((column) => values[column.key] ?? null);
  });
}

function projectSheet(project: Project | null, now: Date): Sheet {
  const row = (field: string, value: Cell): Cell[] => [field, value];
  return {
    name: SHEETS.project,
    header: true,
    widths: [20, 50],
    rows: [
      ['campo', 'valor'],
      row('nome', project?.title ?? null),
      row('descricao', project && project.description !== '' ? project.description : null),
      row('categoria', project?.category ?? null),
      row('inicio', project ? { date: project.startDate } : null),
      row('termino', project ? { date: project.endDate } : null),
      row('modelo_versao', WBS_TEMPLATE_VERSION),
      row('exportado_em', project ? { date: getTodayIsoDate(now) } : null),
    ],
  };
}

/** The full workbook of a project: every task, every link, the calendar and metadata. */
export function buildProjectWorkbook(
  project: Project,
  schedule: ProjectSchedule,
  plan: ScheduleResult,
  forecast: ScheduleForecast | null,
  now = new Date(),
): Sheet[] {
  return [
    instructionsSheet(),
    projectSheet(project, now),
    {
      name: SHEETS.tasks,
      header: true,
      widths: widths(TASK_COLUMNS),
      rows: [
        header(TASK_COLUMNS),
        ...buildTaskRows(schedule, plan, forecast, { inlinePredecessors: false }),
      ],
    },
    {
      name: SHEETS.links,
      header: true,
      widths: widths(LINK_COLUMNS),
      rows: [
        header(LINK_COLUMNS),
        ...schedule.dependencies.map((link): Cell[] => [
          link.predecessorId,
          link.successorId,
          link.type,
          link.lag,
        ]),
      ],
    },
    calendarSheet(schedule),
  ];
}

/** CSV export: the tasks sheet alone, with links in the `predecessoras` column. */
export function buildTasksCsvRows(
  schedule: ProjectSchedule,
  plan: ScheduleResult,
  forecast: ScheduleForecast | null,
): Cell[][] {
  return [
    header(TASK_COLUMNS),
    ...buildTaskRows(schedule, plan, forecast, { inlinePredecessors: true }),
  ];
}

const EXAMPLE_ROWS: Cell[][] = [
  ['ENG', '1', null, 1, 'Engenharia', 'Resumo', null, null, null],
  [
    'LEV',
    '1.1',
    'ENG',
    1,
    'Levantamento técnico',
    'Tarefa',
    null,
    2,
    { date: '2027-03-01' as ISODate },
  ],
  ['PROJ', '1.2', 'ENG', 2, 'Elaboração do projeto', 'Tarefa', null, 4, null],
  ['SUP', '2', null, 2, 'Suprimentos', 'Resumo', null, null, null],
  [
    'COMP',
    '2.1',
    'SUP',
    1,
    'Aquisição de materiais',
    'Tarefa',
    null,
    5,
    { date: '2027-03-01' as ISODate },
  ],
  ['ACEITE', '3', null, 3, 'Aceite final', 'Marco', null, 0, null],
];

/** The blank template, with an "Exemplo" sheet that is never imported. */
export function buildTemplateWorkbook(): Sheet[] {
  const taskHeader = header(TASK_COLUMNS);
  return [
    instructionsSheet(),
    projectSheet(null, new Date()),
    { name: SHEETS.tasks, header: true, widths: widths(TASK_COLUMNS), rows: [taskHeader] },
    {
      name: SHEETS.links,
      header: true,
      widths: widths(LINK_COLUMNS),
      rows: [header(LINK_COLUMNS)],
    },
    calendarSheet(null),
    {
      name: SHEETS.example,
      header: true,
      widths: widths(TASK_COLUMNS),
      rows: [
        [...taskHeader.slice(0, 9)],
        ...EXAMPLE_ROWS,
        [],
        ['Vínculos do exemplo (aba Dependências): LEV → PROJ (FS) e COMP → ACEITE (FS).'],
        ['Esta aba é apenas ilustrativa e não é importada.'],
      ],
    },
  ];
}

/** `horizon-eap-<nome>-<data>.<ext>`, safe for every file system. */
export function getWbsFileName(
  projectTitle: string | null,
  extension: 'xlsx' | 'csv',
  now = new Date(),
): string {
  const slug = (projectTitle ?? 'modelo')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `horizon-eap-${slug || 'projeto'}-${getTodayIsoDate(now)}.${extension}`;
}

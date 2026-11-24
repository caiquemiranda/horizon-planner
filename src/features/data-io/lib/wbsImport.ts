import { FIELD_LIMITS } from '@/features/projects/constants';
import { workFromProgress } from '@/features/schedule/lib/checkIns';
import { TASK_LIMITS } from '@/features/schedule/lib/commands';
import { LAG_LIMIT, sortTopologically } from '@/features/schedule/lib/dependencies';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { createEmptySchedule } from '@/features/schedule/lib/fixtures';
import { projectScheduleSchema } from '@/features/schedule/schemas';
import type { ReadValue, ReadWorkbook } from '@/lib/spreadsheet/xlsxReader';
import type { ISODate, UUID } from '@/types/project';
import {
  DEPENDENCY_TYPES,
  type DependencyType,
  type ProjectSchedule,
  type ScheduleResult,
  type ScheduleTask,
  type TaskDependency,
  type TaskKind,
  type Weekday,
} from '@/types/schedule';

import { SHEETS, TASK_COLUMNS } from './wbsWorkbook';

/**
 * Turns the rows of a spreadsheet into a validated work breakdown structure, without
 * writing anything: the result is a candidate schedule, the counts that would be created
 * and every problem found, by sheet, row and column.
 *
 * Rules (see the WBS contract in `wbsWorkbook.ts`):
 * - `codigo_externo` identifies a row; without it, the WBS code (or the row number) does.
 *   The hierarchy comes from `codigo_pai`, or else from the WBS code (`1.2` is under `1`);
 * - a parent is a summary: its dates and progress are recalculated from its subtasks;
 * - links come from the `Dependências` sheet, or from the `predecessoras` column (CSV);
 * - nothing missing becomes 0, done or today silently: defaults are announced as warnings;
 * - errors block the import, warnings do not.
 */

export type ImportField =
  | 'codigo_externo'
  | 'codigo_eap'
  | 'codigo_pai'
  | 'ordem'
  | 'nome'
  | 'tipo'
  | 'descricao'
  | 'duracao_dias_uteis'
  | 'inicio_planejado'
  | 'responsavel'
  | 'modo'
  | 'percentual'
  | 'predecessoras';

export const IMPORT_FIELDS: readonly ImportField[] = TASK_COLUMNS.filter(
  (column) => !column.exportOnly,
).map((column) => column.key as ImportField);

export const FIELD_LABELS: Record<ImportField, string> = {
  codigo_externo: 'Código (identificador)',
  codigo_eap: 'Código EAP',
  codigo_pai: 'Código do pai',
  ordem: 'Ordem',
  nome: 'Nome',
  tipo: 'Tipo',
  descricao: 'Descrição',
  duracao_dias_uteis: 'Duração (dias úteis)',
  inicio_planejado: 'Início',
  responsavel: 'Responsável',
  modo: 'Modo',
  percentual: 'Progresso (%)',
  predecessoras: 'Predecessoras',
};

/** Other headers people use for the same fields (already normalized). */
const ALIASES: Record<ImportField, string[]> = {
  codigo_externo: ['codigo', 'id', 'id_externo', 'identificador', 'codigo_externo'],
  codigo_eap: ['eap', 'wbs', 'codigo_eap', 'n', 'numero', 'item'],
  codigo_pai: ['pai', 'codigo_pai', 'parent', 'id_pai'],
  ordem: ['ordem', 'posicao', 'order'],
  nome: ['nome', 'nome_da_tarefa', 'tarefa', 'atividade', 'descricao_da_tarefa', 'task', 'name'],
  tipo: ['tipo', 'type', 'categoria_da_linha'],
  descricao: ['descricao', 'observacoes', 'notas', 'notes', 'obs'],
  duracao_dias_uteis: ['duracao', 'duracao_dias_uteis', 'duracao_dias', 'dias', 'duration'],
  inicio_planejado: ['inicio', 'inicio_planejado', 'data_de_inicio', 'start', 'comeco'],
  responsavel: ['responsavel', 'dono', 'owner', 'recurso', 'recursos', 'assignee'],
  modo: ['modo', 'modo_de_agendamento', 'mode'],
  percentual: ['percentual', 'progresso', 'concluido', 'percent_complete', 'porcentagem'],
  predecessoras: ['predecessoras', 'predecessores', 'antecessoras', 'predecessors'],
};

export type ColumnMapping = Partial<Record<ImportField, number>>;

export interface ImportIssue {
  severity: 'error' | 'warning';
  sheet: string | null;
  /** Spreadsheet row number (1 = header). */
  row: number | null;
  column: string | null;
  message: string;
}

export interface ImportPreview {
  /** Sheets of the file, for choosing the tasks sheet (empty for CSV). */
  sheets: string[];
  tasksSheet: string | null;
  header: string[];
  mapping: ColumnMapping;
  project: { title: string; description: string; category: string | null };
  /** The schedule that would be created (fresh ids; `projectId` is set on commit). */
  schedule: ProjectSchedule;
  result: ScheduleResult;
  counts: { summaries: number; tasks: number; milestones: number; links: number };
  issues: ImportIssue[];
  formulaCells: number;
  /** No blocking error. */
  canImport: boolean;
}

export type ImportSource =
  | { kind: 'xlsx'; workbook: ReadWorkbook; fileName: string }
  | { kind: 'csv'; rows: string[][]; fileName: string };

export interface ImportOptions {
  tasksSheet?: string | undefined;
  mapping?: ColumnMapping | undefined;
  today: ISODate;
  generateId: () => UUID;
}

// ── Values ────────────────────────────────────────────────────────────────────────────

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function text(value: ReadValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return value.date;
  return String(value).trim();
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Dates as Excel dates, `aaaa-mm-dd` or `dd/mm/aaaa` (Brazilian order). */
export function parseDate(value: ReadValue | undefined): ISODate | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value.date;
  const raw = String(value).trim();
  if (raw === '') return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    const [, y, m, d] = match.map(Number) as [number, number, number, number];
    return isRealDate(y, m, d) ? (raw as ISODate) : 'invalid';
  }
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (match) {
    const [, d, m, y] = match.map(Number) as [number, number, number, number];
    return isRealDate(y, m, d)
      ? (`${String(y)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as ISODate)
      : 'invalid';
  }
  return 'invalid';
}

function parseNumber(value: ReadValue | undefined): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 'invalid';
  const raw = value.trim().replace('%', '').replace(',', '.');
  if (raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : 'invalid';
}

function parseKind(value: string): TaskKind | null | 'invalid' {
  const normalized = normalizeHeader(value);
  if (normalized === '') return null;
  if (['resumo', 'fase', 'summary', 'etapa'].includes(normalized)) return 'summary';
  if (['tarefa', 'task', 'atividade', 'folha'].includes(normalized)) return 'task';
  if (['marco', 'milestone', 'entrega'].includes(normalized)) return 'milestone';
  return 'invalid';
}

const WEEKDAYS: Record<string, Weekday> = {
  dom: 0,
  domingo: 0,
  seg: 1,
  segunda: 1,
  ter: 2,
  terca: 2,
  qua: 3,
  quarta: 3,
  qui: 4,
  quinta: 4,
  sex: 5,
  sexta: 5,
  sab: 6,
  sabado: 6,
};

/** `codigo[:TIPO][+/-dias]`, as written by the export. */
export function parseLinkReference(
  reference: string,
): { code: string; type: DependencyType; lag: number } | null {
  const match = /^(.+?)(?::(FS|SS|FF|SF))?([+-]\d+)?$/i.exec(reference.trim());
  if (!match?.[1]) return null;
  return {
    code: match[1].trim(),
    type: (match[2]?.toUpperCase() ?? 'FS') as DependencyType,
    lag: match[3] ? Number(match[3]) : 0,
  };
}

// ── Mapping ───────────────────────────────────────────────────────────────────────────

/** Matches headers to fields by name and known aliases; each header used once. */
export function suggestMapping(header: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const normalized = header.map((cell) => normalizeHeader(cell));
  for (const field of IMPORT_FIELDS) {
    for (const alias of [field, ...ALIASES[field]]) {
      const index = normalized.findIndex((cell, position) => cell === alias && !used.has(position));
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

// ── Preview ───────────────────────────────────────────────────────────────────────────

interface RowDraft {
  row: number;
  code: string;
  wbs: string;
  parentCode: string;
  order: number | null;
  name: string;
  kind: TaskKind | null;
  notes: string;
  duration: number | null;
  start: ISODate | null;
  assignee: string | null;
  mode: 'auto' | 'manual';
  progress: number | null;
  predecessors: string;
}

function keyValueSheet(rows: readonly ReadValue[][] | undefined): Map<string, ReadValue> {
  const map = new Map<string, ReadValue>();
  for (const row of rows ?? []) {
    const key = normalizeHeader(text(row[0]));
    if (key !== '' && key !== 'campo') map.set(key, row[1] ?? null);
  }
  return map;
}

export function buildImportPreview(source: ImportSource, options: ImportOptions): ImportPreview {
  const issues: ImportIssue[] = [];
  const error = (
    sheet: string | null,
    row: number | null,
    column: string | null,
    message: string,
  ) => issues.push({ severity: 'error', sheet, row, column, message });
  const warn = (sheet: string | null, row: number | null, column: string | null, message: string) =>
    issues.push({ severity: 'warning', sheet, row, column, message });

  // 1. The sheet with the tasks.
  const sheetNames =
    source.kind === 'xlsx' ? source.workbook.sheets.map((sheet) => sheet.name) : [];
  const findSheet = (name: string) =>
    source.kind === 'xlsx'
      ? source.workbook.sheets.find(
          (sheet) => normalizeHeader(sheet.name) === normalizeHeader(name),
        )
      : undefined;
  const importable = sheetNames.filter(
    (name) => normalizeHeader(name) !== normalizeHeader(SHEETS.example),
  );
  const tasksSheet =
    source.kind === 'csv'
      ? null
      : ((options.tasksSheet && sheetNames.includes(options.tasksSheet)
          ? options.tasksSheet
          : (findSheet(SHEETS.tasks)?.name ??
            importable.find(
              (name) =>
                !Object.values(SHEETS).some((s) => normalizeHeader(s) === normalizeHeader(name)),
            ) ??
            importable[0])) ?? null);
  const taskRows: ReadValue[][] =
    source.kind === 'csv'
      ? source.rows
      : (source.workbook.sheets.find((sheet) => sheet.name === tasksSheet)?.rows ?? []);
  const sheetLabel = source.kind === 'csv' ? null : tasksSheet;

  const header = (taskRows[0] ?? []).map((cell) => text(cell));
  const mapping = options.mapping ?? suggestMapping(header);
  if (mapping.nome === undefined) {
    error(sheetLabel, 1, 'nome', 'Nenhuma coluna foi associada ao nome das tarefas.');
  }
  const ignored = header.filter(
    (cell, index) => cell !== '' && !Object.values(mapping).includes(index),
  );
  if (ignored.length > 0) {
    warn(sheetLabel, 1, null, `Colunas não importadas: ${ignored.join(', ')}.`);
  }

  // 2. Rows.
  const cell = (row: ReadValue[], field: ImportField): ReadValue | undefined => {
    const index = mapping[field];
    return index === undefined ? undefined : row[index];
  };
  const drafts: RowDraft[] = [];
  taskRows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (row.every((value) => text(value) === '')) return;
    const name = text(cell(row, 'nome'));
    const wbs = text(cell(row, 'codigo_eap'));
    const code = text(cell(row, 'codigo_externo')) || wbs || `linha-${String(rowNumber)}`;
    const kindText = text(cell(row, 'tipo'));
    const kind = parseKind(kindText);
    const duration = parseNumber(cell(row, 'duracao_dias_uteis'));
    const start = parseDate(cell(row, 'inicio_planejado'));
    const progress = parseNumber(cell(row, 'percentual'));
    const order = parseNumber(cell(row, 'ordem'));
    const modeText = normalizeHeader(text(cell(row, 'modo')));

    if (name === '') error(sheetLabel, rowNumber, 'nome', 'Nome vazio.');
    else if (name.length > TASK_LIMITS.nameMax)
      error(
        sheetLabel,
        rowNumber,
        'nome',
        `Nome com mais de ${String(TASK_LIMITS.nameMax)} caracteres.`,
      );
    if (kind === 'invalid')
      error(
        sheetLabel,
        rowNumber,
        'tipo',
        `Tipo “${kindText}” desconhecido: use Resumo, Tarefa ou Marco.`,
      );
    if (
      duration === 'invalid' ||
      (typeof duration === 'number' &&
        (!Number.isInteger(duration) || duration < 0 || duration > TASK_LIMITS.durationMax))
    )
      error(
        sheetLabel,
        rowNumber,
        'duracao_dias_uteis',
        'Duração deve ser um número inteiro de dias úteis, de 0 em diante.',
      );
    if (start === 'invalid')
      error(
        sheetLabel,
        rowNumber,
        'inicio_planejado',
        'Data inválida: use dd/mm/aaaa ou aaaa-mm-dd.',
      );
    if (
      progress === 'invalid' ||
      (typeof progress === 'number' && (progress < 0 || progress > 100))
    )
      error(sheetLabel, rowNumber, 'percentual', 'Progresso deve estar entre 0 e 100.');
    if (modeText !== '' && !['manual', 'automatico', 'auto'].includes(modeText))
      warn(
        sheetLabel,
        rowNumber,
        'modo',
        `Modo “${text(cell(row, 'modo'))}” desconhecido: será Automático.`,
      );

    drafts.push({
      row: rowNumber,
      code,
      wbs,
      parentCode: text(cell(row, 'codigo_pai')),
      order: typeof order === 'number' ? order : null,
      name,
      kind: kind === 'invalid' ? null : kind,
      notes: text(cell(row, 'descricao')).slice(0, TASK_LIMITS.notesMax),
      duration: typeof duration === 'number' ? duration : null,
      start: start === 'invalid' ? null : start,
      assignee: text(cell(row, 'responsavel')).slice(0, TASK_LIMITS.assigneeMax) || null,
      mode: modeText === 'manual' ? 'manual' : 'auto',
      progress: typeof progress === 'number' ? Math.round(progress) : null,
      predecessors: text(cell(row, 'predecessoras')),
    });
  });
  if (drafts.length === 0) error(sheetLabel, null, null, 'Nenhuma tarefa encontrada na planilha.');
  if (drafts.length > TASK_LIMITS.tasksMax)
    error(sheetLabel, null, null, `Mais de ${String(TASK_LIMITS.tasksMax)} tarefas.`);

  // 3. Codes and hierarchy.
  const byCode = new Map<string, RowDraft>();
  const byWbs = new Map<string, RowDraft>();
  for (const draft of drafts) {
    if (byCode.has(draft.code)) {
      error(
        sheetLabel,
        draft.row,
        'codigo_externo',
        `Código “${draft.code}” repetido (também na linha ${String(byCode.get(draft.code)?.row)}).`,
      );
    } else {
      byCode.set(draft.code, draft);
    }
    if (draft.wbs !== '') byWbs.set(draft.wbs, draft);
  }
  const parentOf = new Map<RowDraft, RowDraft | null>();
  for (const draft of drafts) {
    let parent: RowDraft | null = null;
    if (draft.parentCode !== '') {
      parent = byCode.get(draft.parentCode) ?? null;
      if (!parent)
        error(
          sheetLabel,
          draft.row,
          'codigo_pai',
          `Pai “${draft.parentCode}” não existe na planilha.`,
        );
      else if (parent === draft) {
        error(sheetLabel, draft.row, 'codigo_pai', 'Uma linha não pode ser pai de si mesma.');
        parent = null;
      }
    } else if (mapping.codigo_pai === undefined && draft.wbs.includes('.')) {
      const parentWbs = draft.wbs.slice(0, draft.wbs.lastIndexOf('.'));
      parent = byWbs.get(parentWbs) ?? null;
      if (!parent)
        error(
          sheetLabel,
          draft.row,
          'codigo_eap',
          `Nenhuma linha com o código EAP “${parentWbs}” para ser o pai.`,
        );
    }
    parentOf.set(draft, parent);
  }
  // Cycles in the hierarchy (A is the parent of B, which is the parent of A).
  for (const draft of drafts) {
    const seen = new Set<RowDraft>([draft]);
    let current = parentOf.get(draft) ?? null;
    while (current) {
      if (seen.has(current)) {
        error(sheetLabel, draft.row, 'codigo_pai', 'A hierarquia forma um ciclo.');
        parentOf.set(draft, null);
        break;
      }
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
  }
  const children = new Map<RowDraft, RowDraft[]>();
  for (const draft of drafts) {
    const parent = parentOf.get(draft) ?? null;
    if (parent) children.set(parent, [...(children.get(parent) ?? []), draft]);
  }
  if (mapping.codigo_pai === undefined && mapping.codigo_eap === undefined && drafts.length > 1) {
    warn(
      sheetLabel,
      null,
      null,
      'Sem colunas de pai ou de código EAP: todas as linhas ficam no primeiro nível.',
    );
  }

  // 4. Kinds, durations, starts.
  const projectFields = keyValueSheet(findSheet(SHEETS.project)?.rows);
  const projectStart = parseDate(projectFields.get('inicio') ?? null);
  const firstStart = drafts
    .map((draft) => draft.start)
    .filter((value): value is ISODate => value !== null)
    .sort()[0];
  const defaultStart: ISODate =
    (projectStart !== null && projectStart !== 'invalid' ? projectStart : undefined) ??
    firstStart ??
    options.today;
  let startsDefaulted = 0;
  const kindOf = new Map<RowDraft, TaskKind>();
  for (const draft of drafts) {
    const hasChildren = (children.get(draft)?.length ?? 0) > 0;
    let kind: TaskKind;
    if (hasChildren) {
      if (draft.kind === 'task' || draft.kind === 'milestone')
        warn(
          sheetLabel,
          draft.row,
          'tipo',
          'Tem subtarefas: será um resumo, com datas e progresso calculados delas.',
        );
      kind = 'summary';
    } else if (draft.kind === 'summary') {
      error(
        sheetLabel,
        draft.row,
        'tipo',
        'Resumo sem subtarefas: mude para Tarefa ou inclua as subtarefas.',
      );
      kind = 'task';
    } else if (draft.kind === null) {
      kind = draft.duration === 0 ? 'milestone' : 'task';
      if (mapping.tipo !== undefined)
        warn(
          sheetLabel,
          draft.row,
          'tipo',
          `Tipo vazio: considerado ${kind === 'milestone' ? 'Marco (duração 0)' : 'Tarefa'}.`,
        );
    } else {
      kind = draft.kind;
    }
    kindOf.set(draft, kind);
    if (kind === 'milestone' && draft.duration !== null && draft.duration !== 0)
      warn(
        sheetLabel,
        draft.row,
        'duracao_dias_uteis',
        'Marco tem duração 0: a duração informada foi ignorada.',
      );
    if (kind === 'task' && draft.duration === null)
      error(sheetLabel, draft.row, 'duracao_dias_uteis', 'Duração obrigatória para tarefas.');
    if (kind === 'task' && draft.duration === 0)
      warn(sheetLabel, draft.row, 'duracao_dias_uteis', 'Duração 0: a tarefa será um marco.');
    if (kind !== 'summary' && draft.start === null) startsDefaulted += 1;
  }
  if (startsDefaulted > 0)
    warn(
      sheetLabel,
      null,
      'inicio_planejado',
      `${String(startsDefaulted)} tarefa(s) sem início: começam em ${defaultStart.split('-').reverse().join('/')} (ou depois, pelos vínculos).`,
    );
  if (drafts.some((draft) => draft.progress !== null && draft.progress > 0))
    warn(
      sheetLabel,
      null,
      'percentual',
      'O progresso é importado como percentual; confirmações diárias e datas reais não vêm da planilha.',
    );

  // 5. Links.
  interface LinkDraft {
    predecessor: string;
    successor: string;
    type: DependencyType;
    lag: number;
    sheet: string | null;
    row: number | null;
  }
  const linkDrafts: LinkDraft[] = [];
  const linksSheet = findSheet(SHEETS.links);
  if (linksSheet) {
    const linkHeader = (linksSheet.rows[0] ?? []).map((value) => normalizeHeader(text(value)));
    const at = (names: string[]) => linkHeader.findIndex((value) => names.includes(value));
    const predecessorIndex = at(['predecessora', 'predecessor', 'de']);
    const successorIndex = at(['sucessora', 'successor', 'para']);
    const typeIndex = at(['tipo', 'type']);
    const lagIndex = at(['defasagem_dias_uteis', 'defasagem', 'lag', 'atraso']);
    linksSheet.rows.slice(1).forEach((row, offset) => {
      const rowNumber = offset + 2;
      if (row.every((value) => text(value) === '')) return;
      const typeText = text(row[typeIndex]).toUpperCase() || 'FS';
      const lag = parseNumber(row[lagIndex]);
      if (!(DEPENDENCY_TYPES as readonly string[]).includes(typeText)) {
        error(
          linksSheet.name,
          rowNumber,
          'tipo',
          `Tipo de vínculo “${typeText}” desconhecido: use FS, SS, FF ou SF.`,
        );
        return;
      }
      if (
        lag === 'invalid' ||
        (typeof lag === 'number' && (!Number.isInteger(lag) || Math.abs(lag) > LAG_LIMIT))
      ) {
        error(
          linksSheet.name,
          rowNumber,
          'defasagem_dias_uteis',
          `Defasagem deve ser inteira, entre -${String(LAG_LIMIT)} e ${String(LAG_LIMIT)}.`,
        );
        return;
      }
      linkDrafts.push({
        predecessor: text(row[predecessorIndex]),
        successor: text(row[successorIndex]),
        type: typeText as DependencyType,
        lag: typeof lag === 'number' ? lag : 0,
        sheet: linksSheet.name,
        row: rowNumber,
      });
    });
    if (drafts.some((draft) => draft.predecessors !== ''))
      warn(
        sheetLabel,
        null,
        'predecessoras',
        'A coluna predecessoras foi ignorada: os vínculos vêm da aba Dependências.',
      );
  } else {
    for (const draft of drafts) {
      for (const reference of draft.predecessors
        .split(/[,;]/)
        .map((part) => part.trim())
        .filter(Boolean)) {
        const parsed = parseLinkReference(reference);
        if (!parsed) {
          error(sheetLabel, draft.row, 'predecessoras', `Predecessora “${reference}” ilegível.`);
          continue;
        }
        linkDrafts.push({
          predecessor: parsed.code,
          successor: draft.code,
          type: parsed.type,
          lag: parsed.lag,
          sheet: sheetLabel,
          row: draft.row,
        });
      }
    }
  }

  // 6. The candidate schedule, with fresh ids.
  const idOf = new Map<RowDraft, UUID>(drafts.map((draft) => [draft, options.generateId()]));
  const ordered = new Map<RowDraft | null, RowDraft[]>();
  for (const draft of drafts) {
    const parent = parentOf.get(draft) ?? null;
    ordered.set(parent, [...(ordered.get(parent) ?? []), draft]);
  }
  for (const siblings of ordered.values()) {
    siblings.sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
        a.row - b.row,
    );
  }
  const tasks: ScheduleTask[] = [];
  for (const [parent, siblings] of ordered) {
    siblings.forEach((draft, order) => {
      const kind = kindOf.get(draft) ?? 'task';
      const duration = kind === 'milestone' ? 0 : kind === 'summary' ? 1 : (draft.duration ?? 1);
      const progress =
        kind === 'summary'
          ? 0
          : kind === 'milestone'
            ? draft.progress === 100
              ? 100
              : 0
            : (draft.progress ?? 0);
      tasks.push({
        id: idOf.get(draft) ?? options.generateId(),
        parentId: parent ? (idOf.get(parent) ?? null) : null,
        order,
        name: draft.name || `Linha ${String(draft.row)}`,
        assignee: draft.assignee,
        notes: draft.notes,
        mode: draft.mode,
        start: draft.start ?? defaultStart,
        duration,
        progress,
        completedWork: workFromProgress(progress, duration),
        actualStart: null,
        actualFinish: null,
      });
    });
  }

  const dependencies: TaskDependency[] = [];
  const pairs = new Set<string>();
  for (const link of linkDrafts) {
    const predecessor = byCode.get(link.predecessor);
    const successor = byCode.get(link.successor);
    if (!predecessor || !successor) {
      error(
        link.sheet,
        link.row,
        'predecessora',
        `Vínculo com código inexistente: “${!predecessor ? link.predecessor : link.successor}”.`,
      );
      continue;
    }
    if (predecessor === successor) {
      error(
        link.sheet,
        link.row,
        'predecessora',
        `A tarefa “${link.predecessor}” não pode depender dela mesma.`,
      );
      continue;
    }
    if (kindOf.get(predecessor) === 'summary' || kindOf.get(successor) === 'summary') {
      error(
        link.sheet,
        link.row,
        'predecessora',
        'Vínculos ligam tarefas, não resumos: vincule as subtarefas.',
      );
      continue;
    }
    const pair = `${predecessor.code}→${successor.code}`;
    if (pairs.has(`${successor.code}→${predecessor.code}`)) {
      error(
        link.sheet,
        link.row,
        'predecessora',
        `“${predecessor.code}” e “${successor.code}” já estão vinculadas no sentido oposto: isso formaria um ciclo.`,
      );
      continue;
    }
    if (pairs.has(pair)) {
      warn(
        link.sheet,
        link.row,
        'predecessora',
        `Vínculo repetido de “${predecessor.code}” para “${successor.code}”: só o primeiro foi mantido.`,
      );
      continue;
    }
    pairs.add(pair);
    dependencies.push({
      id: options.generateId(),
      predecessorId: idOf.get(predecessor) ?? '',
      successorId: idOf.get(successor) ?? '',
      type: link.type,
      lag: link.lag,
    });
  }
  const leafIds = tasks
    .filter((task) => !tasks.some((other) => other.parentId === task.id))
    .map((task) => task.id);
  const { cyclicIds } = sortTopologically(leafIds, dependencies);
  if (cyclicIds.size > 0) {
    const names = tasks.filter((task) => cyclicIds.has(task.id)).map((task) => task.name);
    error(
      linksSheet?.name ?? sheetLabel,
      null,
      'predecessora',
      `Os vínculos formam um ciclo entre: ${names.join(', ')}.`,
    );
  }

  // 7. Calendar.
  const calendar = { ...createEmptySchedule('preview').calendar };
  const calendarRows = findSheet(SHEETS.calendar)?.rows;
  if (calendarRows) {
    const fields = keyValueSheet(calendarRows);
    const days = text(fields.get('dias_uteis') ?? null);
    if (days !== '') {
      const parsed = days.split(/[,;\s]+/).map((part) => WEEKDAYS[normalizeHeader(part)]);
      if (parsed.some((day) => day === undefined) || parsed.length === 0) {
        warn(
          findSheet(SHEETS.calendar)?.name ?? null,
          null,
          'dias_uteis',
          `Dias úteis “${days}” ilegíveis: usado segunda a sexta.`,
        );
      } else {
        calendar.workingWeekdays = [...new Set(parsed as Weekday[])].sort();
      }
    }
    const holidayStart = calendarRows.findIndex(
      (row) => normalizeHeader(text(row[0])) === 'feriado_data',
    );
    if (holidayStart >= 0) {
      for (const [offset, row] of calendarRows.slice(holidayStart + 1).entries()) {
        const date = parseDate(row[0]);
        if (date === null) continue;
        if (date === 'invalid') {
          warn(
            findSheet(SHEETS.calendar)?.name ?? null,
            holidayStart + offset + 2,
            'feriado_data',
            'Data de feriado inválida: ignorada.',
          );
          continue;
        }
        calendar.holidays.push({ date, name: text(row[1]).slice(0, 120) || 'Feriado' });
      }
    }
  }

  // 8. Project fields.
  const titleValue = text(projectFields.get('nome') ?? null);
  const fallbackTitle = source.fileName.replace(/\.[^.]+$/, '').slice(0, FIELD_LIMITS.titleMax);
  if (titleValue === '')
    warn(null, null, 'nome', `Projeto sem nome na aba Projeto: será “${fallbackTitle}”.`);
  const project = {
    title: (titleValue || fallbackTitle || 'Projeto importado').slice(0, FIELD_LIMITS.titleMax),
    description: text(projectFields.get('descricao') ?? null).slice(0, FIELD_LIMITS.descriptionMax),
    category:
      text(projectFields.get('categoria') ?? null).slice(0, FIELD_LIMITS.categoryMax) || null,
  };
  if (source.kind === 'xlsx' && source.workbook.formulaCells > 0)
    warn(
      null,
      null,
      null,
      `${String(source.workbook.formulaCells)} célula(s) com fórmula: foi usado o valor salvo, sem calcular.`,
    );

  const schedule: ProjectSchedule = {
    ...createEmptySchedule('preview'),
    calendar,
    tasks,
    dependencies,
  };
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  if (!hasErrors) {
    const validation = projectScheduleSchema.safeParse(schedule);
    if (!validation.success)
      error(
        null,
        null,
        null,
        `Estrutura inválida: ${validation.error.issues[0]?.message ?? 'erro desconhecido'}.`,
      );
  }
  const result = computeSchedule(schedule);
  const counts = { summaries: 0, tasks: 0, milestones: 0, links: dependencies.length };
  for (const task of result.tasks.values()) {
    if (task.kind === 'summary') counts.summaries += 1;
    else if (task.kind === 'milestone') counts.milestones += 1;
    else counts.tasks += 1;
  }

  return {
    sheets: sheetNames,
    tasksSheet,
    header,
    mapping,
    project,
    schedule,
    result,
    counts,
    issues: [...issues].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1,
    ),
    formulaCells: source.kind === 'xlsx' ? source.workbook.formulaCells : 0,
    canImport: !issues.some((issue) => issue.severity === 'error'),
  };
}

/**
 * Layout of the workspace. The Gantt pane reuses `rowHeight` and `headerHeight`, so a
 * row of the table and its bar always share the same Y coordinate.
 */
export const WORKSPACE_METRICS = {
  rowHeight: 36,
  /** Two ruler rows on the Gantt side; the table header uses the same height. */
  headerHeight: 56,
  indentPx: 16,
} as const;

export type ColumnKey =
  | 'wbs'
  | 'name'
  | 'duration'
  | 'start'
  | 'finish'
  | 'predecessors'
  | 'assignee'
  | 'progress'
  | 'status';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Spoken header when the visible label is abbreviated. */
  ariaLabel?: string;
  width: number;
  align?: 'start' | 'end';
  /** Never editable (derived): WBS and status. */
  derived?: boolean;
  /** Editable only on leaf tasks (summary values are rolled up). */
  leafOnly?: boolean;
}

export const COLUMNS: readonly ColumnDef[] = [
  { key: 'wbs', label: 'EAP', ariaLabel: 'Número EAP', width: 64, derived: true },
  { key: 'name', label: 'Nome da tarefa', width: 300 },
  { key: 'duration', label: 'Duração', width: 92, align: 'end', leafOnly: true },
  { key: 'start', label: 'Início', width: 112, leafOnly: true },
  { key: 'finish', label: 'Término', width: 112, leafOnly: true },
  { key: 'predecessors', label: 'Predecessoras', width: 132, leafOnly: true },
  { key: 'assignee', label: 'Responsável', width: 136 },
  { key: 'progress', label: '%', ariaLabel: 'Progresso', width: 68, align: 'end', leafOnly: true },
  { key: 'status', label: 'Status', width: 124, derived: true },
];

export const COLUMN_WIDTH_LIMITS = { min: 48, max: 640 } as const;

/** Columns that can never be hidden: the task name carries the hierarchy. */
export const REQUIRED_COLUMNS: readonly ColumnKey[] = ['name'];

export function clampColumnWidth(width: number): number {
  return Math.round(Math.min(COLUMN_WIDTH_LIMITS.max, Math.max(COLUMN_WIDTH_LIMITS.min, width)));
}

/** Visible columns, in order, with the user's widths applied. */
export function resolveColumns(
  widths: Partial<Record<ColumnKey, number>>,
  hidden: readonly ColumnKey[],
): ColumnDef[] {
  return COLUMNS.filter(
    (column) => REQUIRED_COLUMNS.includes(column.key) || !hidden.includes(column.key),
  ).map((column) => {
    const width = widths[column.key];
    return width === undefined ? column : { ...column, width: clampColumnWidth(width) };
  });
}

export function getGridTemplate(columns: readonly ColumnDef[]): string {
  return columns.map((column) => `${String(column.width)}px`).join(' ');
}

export function getGridWidth(columns: readonly ColumnDef[]): number {
  return columns.reduce((total, column) => total + column.width, 0);
}

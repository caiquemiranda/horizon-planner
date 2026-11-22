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

export const GRID_TEMPLATE = COLUMNS.map((column) => `${String(column.width)}px`).join(' ');
export const GRID_WIDTH = COLUMNS.reduce((total, column) => total + column.width, 0);

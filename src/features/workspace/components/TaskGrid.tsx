import { ChevronRight, Diamond, Ellipsis, GripVertical, Pin, TriangleAlert } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getDisplayFinish } from '@/features/schedule/lib/engine';
import type { TreeRow } from '@/features/schedule/lib/tree';
import { dayToIsoDate } from '@/features/timeline/lib/time';
import { cn } from '@/lib/utils';
import type { UUID } from '@/types/project';
import type { ScheduledTask } from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

import type { WorkspaceActions } from '../hooks/useWorkspaceActions';
import type { WorkspaceModel } from '../hooks/useWorkspaceModel';
import {
  durationForFinish,
  formatCellDate,
  formatDuration,
  getTaskStatus,
  parseDateInput,
  parseDurationInput,
  parseProgressInput,
  TASK_STATUS_LABELS,
} from '../lib/cells';
import {
  type ColumnDef,
  type ColumnKey,
  getGridTemplate,
  getGridWidth,
  resolveColumns,
  WORKSPACE_METRICS,
} from '../lib/columns';
import { type DropTarget, getDropMove, getDropZone } from '../lib/rowDrop';
import { useWorkspaceUiStore } from '../store/workspaceUiStore';
import { CellEditor, type EditorExit } from './CellEditor';
import { ColumnResizer } from './ColumnResizer';
import { RowMenu } from './RowMenu';

interface TaskGridProps {
  model: WorkspaceModel;
  actions: WorkspaceActions;
  selectedId: UUID | null;
  onSelect: (id: UUID | null) => void;
  onToggle: (id: UUID) => void;
  onRequestDelete: (id: UUID) => void;
  /** Called with the id of a task created from the grid, so its name opens for editing. */
  onTaskCreated: (id: UUID | null) => void;
  /** Opens the links dialog of a task. */
  onEditLinks?: (id: UUID) => void;
  /** Task whose name cell should open in edit mode (e.g. right after creating it). */
  editRequest: UUID | null;
  onEditRequestHandled: () => void;
  today: DayNumber;
  readOnly?: boolean;
  label: string;
  /** The scroll container, shared with the Gantt so both panes scroll as one. */
  scrollerRef?: RefObject<HTMLDivElement | null>;
  hoveredId?: UUID | null;
  onHover?: (id: UUID | null) => void;
}

interface ActiveCell {
  rowId: UUID;
  column: ColumnKey;
}

function isEditable(column: ColumnDef, row: TreeRow, scheduled: ScheduledTask | undefined) {
  if (column.derived) return false;
  if (column.leafOnly) return scheduled !== undefined && scheduled.kind !== 'summary';
  return !row.isFilterContext || column.key === 'name';
}

/** Value placed in the editor when editing starts. */
function editorValue(
  column: ColumnKey,
  row: TreeRow,
  scheduled: ScheduledTask | undefined,
  model: WorkspaceModel,
) {
  switch (column) {
    case 'name':
      return row.task.name;
    case 'duration':
      return String(scheduled?.duration ?? row.task.duration);
    case 'start':
      return scheduled ? dayToIsoDate(scheduled.start) : row.task.start;
    case 'finish':
      return scheduled ? dayToIsoDate(getDisplayFinish(scheduled)) : row.task.start;
    case 'predecessors':
      return model.predecessors.get(row.task.id) ?? '';
    case 'assignee':
      return row.task.assignee ?? '';
    case 'progress':
      return String(row.task.progress);
    default:
      return '';
  }
}

/**
 * Hierarchical, editable task table (WAI-ARIA treegrid).
 *
 * Keyboard: arrows move between cells, Enter/F2 (or a double click) edits, Esc cancels, Tab commits and moves
 * to the next editable cell, → / ← on the name expand or collapse, Alt+Shift+→/← indent
 * and outdent, Alt+Shift+↑/↓ reorder, Insert adds a task below, Delete removes one,
 * Shift+F10 opens the row menu. Typing alone never starts an edit, so the chart's single
 * key shortcuts (T, F, +, -, 1–5) cannot change data by accident.
 */
export function TaskGrid({
  model,
  actions,
  selectedId,
  onSelect,
  onToggle,
  onRequestDelete,
  onTaskCreated,
  onEditLinks,
  editRequest,
  onEditRequestHandled,
  today,
  readOnly = false,
  label,
  scrollerRef,
  hoveredId = null,
  onHover,
}: TaskGridProps) {
  const { rows, result, wbs } = model;
  const columnWidths = useWorkspaceUiStore((state) => state.columnWidths);
  const hiddenColumns = useWorkspaceUiStore((state) => state.hiddenColumns);
  const setColumnWidth = useWorkspaceUiStore((state) => state.setColumnWidth);
  const columns = useMemo(
    () => resolveColumns(columnWidths, hiddenColumns),
    [columnWidths, hiddenColumns],
  );
  const columnKeys = columns.map((column) => column.key);
  const gridTemplate = getGridTemplate(columns);
  const [active, setActive] = useState<ActiveCell | null>(null);
  const [editing, setEditing] = useState<{
    cell: ActiveCell;
    initial: string;
    error: string | null;
    /** New editor instance per opening (keeps the typed value while an error shows). */
    session: number;
  } | null>(null);
  const [menuRowId, setMenuRowId] = useState<UUID | null>(null);
  const sessions = useRef(0);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  const rowIndexById = useMemo(
    () => new Map(rows.map((row, index) => [row.task.id, index])),
    [rows],
  );
  const fallbackRowId = rows[0]?.task.id ?? null;

  // Keep the active cell on a visible row: a collapsed or deleted row hands over to the
  // nearest visible ancestor, or the first row.
  const activeRowId =
    active && rowIndexById.has(active.rowId) && columnKeys.includes(active.column)
      ? active.rowId
      : null;
  let resolvedActive: ActiveCell | null = active && activeRowId ? active : null;
  if (!resolvedActive && active) {
    let parentId = model.index.byId.get(active.rowId)?.parentId ?? null;
    while (parentId !== null && !rowIndexById.has(parentId)) {
      parentId = model.index.byId.get(parentId)?.parentId ?? null;
    }
    const rowId = parentId ?? fallbackRowId;
    resolvedActive = rowId ? { rowId, column: active.column } : null;
  }
  if (!resolvedActive && selectedId && rowIndexById.has(selectedId)) {
    resolvedActive = { rowId: selectedId, column: 'name' };
  }
  if (!resolvedActive && fallbackRowId) resolvedActive = { rowId: fallbackRowId, column: 'name' };

  // The selection follows the hidden row to its visible ancestor as well.
  useEffect(() => {
    if (selectedId && !rowIndexById.has(selectedId) && resolvedActive) {
      onSelect(model.index.byId.has(selectedId) ? resolvedActive.rowId : null);
    }
  });

  // ── Reordering rows by dragging ───────────────────────────────────────────────────
  const [rowDrag, setRowDrag] = useState<{ id: UUID; target: DropTarget | null } | null>(null);
  const rowDragRef = useRef(rowDrag);
  rowDragRef.current = rowDrag;

  useEffect(() => {
    if (!rowDrag) return;
    const scroller = (scrollerRef ?? gridRef).current;

    const handleMove = (event: globalThis.PointerEvent) => {
      const current = rowDragRef.current;
      if (!current) return;
      const rowElement = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[role=row][data-task-id]');
      const rowId = rowElement?.dataset.taskId;
      let target: DropTarget | null = null;
      if (rowElement && rowId && rowId !== current.id) {
        const rect = rowElement.getBoundingClientRect();
        const ratio = (event.clientY - rect.top) / rect.height;
        target = { rowId, zone: getDropZone(ratio) };
      }
      setRowDrag({ ...current, target });
      // Near the top or bottom of the table, scroll to reach rows out of view.
      const rect = scroller?.getBoundingClientRect();
      if (scroller && rect) {
        if (event.clientY < rect.top + WORKSPACE_METRICS.headerHeight + 24)
          scroller.scrollTop -= 12;
        else if (event.clientY > rect.bottom - 24) scroller.scrollTop += 12;
      }
    };
    const handleUp = () => {
      const current = rowDragRef.current;
      setRowDrag(null);
      if (!current?.target) return;
      const move = getDropMove(model.index, current.id, current.target);
      if (move) actions.moveTo(current.id, move.parentId, move.position);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setRowDrag(null);
      }
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('keydown', handleKey);
    };
  }, [rowDrag !== null, model.index, actions, scrollerRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const cellKey = (cell: ActiveCell) => `${cell.rowId}:${cell.column}`;

  const focusCell = useCallback((cell: ActiveCell) => {
    focusPending.current = true;
    setActive(cell);
  }, []);

  useLayoutEffect(() => {
    if (!focusPending.current || !resolvedActive || editing) return;
    focusPending.current = false;
    cellRefs.current.get(cellKey(resolvedActive))?.focus();
  });

  const startEditing = useCallback(
    (cell: ActiveCell, initial?: string) => {
      if (readOnly) return;
      const row = rows[rowIndexById.get(cell.rowId) ?? -1];
      const column = columns.find((item) => item.key === cell.column);
      if (!row || !column) return;
      const scheduled = result.tasks.get(row.task.id);
      if (!isEditable(column, row, scheduled)) return;
      setActive(cell);
      sessions.current += 1;
      setEditing({
        cell,
        initial: initial ?? editorValue(cell.column, row, scheduled, model),
        error: null,
        session: sessions.current,
      });
    },
    [readOnly, rows, rowIndexById, result, model, columns],
  );

  // Open the name editor of a task that was just created.
  useEffect(() => {
    if (editRequest && rowIndexById.has(editRequest)) {
      startEditing({ rowId: editRequest, column: 'name' });
      onEditRequestHandled();
    }
  }, [editRequest, rowIndexById, startEditing, onEditRequestHandled]);

  /** Applies the editor value. Returns an error message, or `null` when saved. */
  const commit = (cell: ActiveCell, text: string): string | null => {
    const row = rows[rowIndexById.get(cell.rowId) ?? -1];
    if (!row) return null;
    const scheduled = result.tasks.get(row.task.id);
    if (text === editorValue(cell.column, row, scheduled, model)) return null;
    const id = row.task.id;

    switch (cell.column) {
      case 'name':
        return actions.update(id, { name: text });
      case 'assignee':
        return actions.update(id, { assignee: text });
      case 'duration': {
        const parsed = parseDurationInput(text);
        return parsed.ok ? actions.update(id, { duration: parsed.value }) : parsed.error;
      }
      case 'progress': {
        const parsed = parseProgressInput(text);
        return parsed.ok ? actions.update(id, { progress: parsed.value }) : parsed.error;
      }
      case 'start': {
        const parsed = parseDateInput(text);
        return parsed.ok ? actions.update(id, { start: parsed.value }) : parsed.error;
      }
      case 'finish': {
        const parsed = parseDateInput(text);
        if (!parsed.ok || !scheduled) return parsed.ok ? null : parsed.error;
        const duration = durationForFinish(model.calendar, scheduled.start, parsed.value);
        return duration.ok ? actions.update(id, { duration: duration.value }) : duration.error;
      }
      case 'predecessors':
        return actions.setPredecessorsText(id, text);
      default:
        return null;
    }
  };

  /** Returns whether the value was accepted (the editor then closes). */
  const finishEditing = (value: string, move: EditorExit): boolean => {
    if (!editing) return true;
    const error = commit(editing.cell, value);
    if (error) {
      setEditing({ ...editing, error });
      return false;
    }
    setEditing(null);
    const { cell } = editing;
    if (move === 'down') {
      const next = rows[(rowIndexById.get(cell.rowId) ?? 0) + 1];
      focusCell(next ? { rowId: next.task.id, column: cell.column } : cell);
    } else if (move === 'next' || move === 'previous') {
      const target = findEditableNeighbour(cell, move === 'next' ? 1 : -1);
      if (target) startEditing(target);
      else focusCell(cell);
    } else {
      focusCell(cell);
    }
    return true;
  };

  const findEditableNeighbour = (from: ActiveCell, step: 1 | -1): ActiveCell | null => {
    let rowIndex = rowIndexById.get(from.rowId) ?? 0;
    let columnIndex = columnKeys.indexOf(from.column);
    for (let guard = 0; guard < rows.length * columns.length; guard += 1) {
      columnIndex += step;
      if (columnIndex >= columns.length) {
        columnIndex = 0;
        rowIndex += 1;
      } else if (columnIndex < 0) {
        columnIndex = columns.length - 1;
        rowIndex -= 1;
      }
      const row = rows[rowIndex];
      const column = columns[columnIndex];
      if (!row || !column) return null;
      if (isEditable(column, row, result.tasks.get(row.task.id))) {
        return { rowId: row.task.id, column: column.key };
      }
    }
    return null;
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !resolvedActive) return;
    const current = resolvedActive;
    const rowIndex = rowIndexById.get(current.rowId) ?? 0;
    const columnIndex = columnKeys.indexOf(current.column);
    const row = rows[rowIndex];
    if (!row) return;
    const id = row.task.id;
    const moveTo = (nextRow: number, nextColumn: number) => {
      const targetRow = rows[Math.max(0, Math.min(rows.length - 1, nextRow))];
      const targetColumn = columns[Math.max(0, Math.min(columns.length - 1, nextColumn))];
      if (targetRow && targetColumn) {
        focusCell({ rowId: targetRow.task.id, column: targetColumn.key });
        onSelect(targetRow.task.id);
      }
    };

    if (event.altKey && event.shiftKey && !readOnly) {
      const handled: Partial<Record<string, () => void>> = {
        ArrowRight: () => {
          actions.indent(id);
        },
        ArrowLeft: () => {
          actions.outdent(id);
        },
        ArrowUp: () => {
          actions.move(id, -1);
        },
        ArrowDown: () => {
          actions.move(id, 1);
        },
      };
      const run = handled[event.key];
      if (run) {
        event.preventDefault();
        run();
        focusCell(current);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveTo(rowIndex + 1, columnIndex);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveTo(rowIndex - 1, columnIndex);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (current.column === 'name' && row.hasChildren && !row.expanded) onToggle(id);
        else moveTo(rowIndex, columnIndex + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (current.column === 'name' && row.hasChildren && row.expanded) onToggle(id);
        else if (
          current.column === 'name' &&
          row.task.parentId &&
          rowIndexById.has(row.task.parentId)
        ) {
          moveTo(rowIndexById.get(row.task.parentId) ?? rowIndex, columnIndex);
        } else moveTo(rowIndex, columnIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(event.ctrlKey ? 0 : rowIndex, 0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(event.ctrlKey ? rows.length - 1 : rowIndex, columns.length - 1);
        break;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        onSelect(id);
        startEditing(current);
        break;
      case ' ':
        event.preventDefault();
        onSelect(id);
        break;
      case 'Insert':
        if (readOnly) break;
        event.preventDefault();
        onTaskCreated(actions.addTask(id));
        break;
      case 'Delete':
        if (readOnly) break;
        event.preventDefault();
        onRequestDelete(id);
        break;
      case 'F10':
        if (event.shiftKey) {
          event.preventDefault();
          setMenuRowId(id);
        }
        break;
      case 'ContextMenu':
        event.preventDefault();
        setMenuRowId(id);
        break;
    }
  };

  const renderDisplay = (
    column: ColumnKey,
    row: TreeRow,
    scheduled: ScheduledTask | undefined,
  ): ReactNode => {
    const isSummary = scheduled?.kind === 'summary';
    switch (column) {
      case 'wbs':
        return (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {wbs.get(row.task.id)}
          </span>
        );
      case 'name':
        return null;
      case 'duration':
        return scheduled ? formatDuration(scheduled.duration) : '';
      case 'start':
        return scheduled ? formatCellDate(scheduled.start) : '';
      case 'finish':
        return scheduled ? formatCellDate(getDisplayFinish(scheduled)) : '';
      case 'predecessors':
        return isSummary ? '' : model.predecessors.get(row.task.id);
      case 'assignee':
        return row.task.assignee;
      case 'progress':
        return scheduled ? `${String(scheduled.progress)}%` : '';
      case 'status': {
        if (!scheduled) return '';
        const status = getTaskStatus(scheduled, today);
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              status === 'late' && 'text-destructive',
              status === 'done' && 'text-muted-foreground',
            )}
          >
            {status === 'late' ? <TriangleAlert aria-hidden="true" className="size-3" /> : null}
            {TASK_STATUS_LABELS[status]}
          </span>
        );
      }
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto" ref={scrollerRef ?? gridRef}>
      <div
        role="treegrid"
        // Focus lives on the active cell (roving tabindex); the grid itself is not a tab stop.
        tabIndex={-1}
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length}
        aria-readonly={readOnly || undefined}
        aria-multiselectable={false}
        onKeyDown={handleGridKeyDown}
        className="relative text-[13px]"
        style={{ width: getGridWidth(columns), minWidth: '100%' }}
      >
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-10 grid items-end border-b bg-background pb-1.5"
          style={{ gridTemplateColumns: gridTemplate, height: WORKSPACE_METRICS.headerHeight }}
        >
          {columns.map((column, index) => (
            <div
              key={column.key}
              role="columnheader"
              aria-colindex={index + 1}
              aria-label={column.ariaLabel}
              className={cn('relative px-2 text-label', column.align === 'end' && 'text-right')}
            >
              {column.label}
              <ColumnResizer
                width={column.width}
                onResize={(width) => {
                  setColumnWidth(column.key, width);
                }}
              />
            </div>
          ))}
        </div>

        {rows.map((row, rowIndex) => {
          const id = row.task.id;
          const scheduled = result.tasks.get(id);
          const isSummary = scheduled?.kind === 'summary';
          const isMilestone = scheduled?.kind === 'milestone';
          const isSelected = selectedId === id;
          const issues = scheduled?.issues ?? [];

          return (
            // Rows are selected by mouse here; the keyboard equivalent is handled by the grid.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={id}
              role="row"
              tabIndex={-1}
              aria-rowindex={rowIndex + 2}
              aria-level={row.depth + 1}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              aria-selected={isSelected}
              data-task-id={id}
              onClick={() => {
                onSelect(id);
              }}
              onMouseEnter={() => onHover?.(id)}
              onMouseLeave={() => onHover?.(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                onSelect(id);
                setMenuRowId(id);
              }}
              className={cn(
                'group grid border-b border-timeline-grid',
                rowDrag?.id === id && 'opacity-50',
                rowDrag?.target?.rowId === id &&
                  {
                    before: 'shadow-[inset_0_2px_0_var(--ring)]',
                    after: 'shadow-[inset_0_-2px_0_var(--ring)]',
                    inside: 'outline-2 -outline-offset-2 outline-ring',
                  }[rowDrag.target.zone],
                isSelected ? 'bg-accent' : hoveredId === id ? 'bg-muted/50' : 'hover:bg-muted/50',
                row.isFilterContext && 'text-muted-foreground',
              )}
              style={{ gridTemplateColumns: gridTemplate, height: WORKSPACE_METRICS.rowHeight }}
            >
              {columns.map((column, columnIndex) => {
                const cell = { rowId: id, column: column.key };
                const isActive =
                  resolvedActive?.rowId === id && resolvedActive.column === column.key;
                const editor =
                  editing?.cell.rowId === id && editing.cell.column === column.key ? editing : null;
                const isEditing = editor !== null;
                const editable = !readOnly && isEditable(column, row, scheduled);
                const errorId = `${id}-${column.key}-error`;

                return (
                  <div
                    key={column.key}
                    ref={(element) => {
                      if (element) cellRefs.current.set(cellKey(cell), element);
                      else cellRefs.current.delete(cellKey(cell));
                    }}
                    role="gridcell"
                    aria-colindex={columnIndex + 1}
                    aria-readonly={!editable || undefined}
                    tabIndex={isActive && !isEditing ? 0 : -1}
                    onFocus={(event) => {
                      if (event.target === event.currentTarget) setActive(cell);
                    }}
                    onDoubleClick={() => {
                      onSelect(id);
                      startEditing(cell);
                    }}
                    title={
                      column.leafOnly && isSummary ? 'Calculado a partir das subtarefas' : undefined
                    }
                    className={cn(
                      'relative flex min-w-0 items-center px-2 outline-none',
                      column.align === 'end' && 'justify-end text-right tabular-nums',
                      (column.key === 'start' ||
                        column.key === 'finish' ||
                        column.key === 'duration') &&
                        'tabular-nums',
                      isActive && 'ring-2 ring-ring ring-inset',
                      column.leafOnly && isSummary && 'text-muted-foreground',
                      isSummary && 'font-semibold',
                    )}
                  >
                    {editor ? (
                      <CellEditor
                        key={editor.session}
                        column={column}
                        initialValue={editor.initial}
                        label={`${column.ariaLabel ?? column.label} de ${model.describeTask(id)}`}
                        error={editor.error}
                        errorId={errorId}
                        onCommit={finishEditing}
                        onCancel={() => {
                          setEditing(null);
                          focusCell(cell);
                        }}
                      />
                    ) : column.key === 'name' ? (
                      <div
                        className="flex min-w-0 flex-1 items-center gap-1"
                        style={{ paddingLeft: row.depth * WORKSPACE_METRICS.indentPx }}
                      >
                        {!readOnly ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-hidden="true"
                            data-row-grip=""
                            title="Arraste para reordenar (teclado: Alt+Shift+setas)"
                            onPointerDown={(event) => {
                              if (event.pointerType === 'mouse' && event.button !== 0) return;
                              event.preventDefault();
                              event.stopPropagation();
                              onSelect(id);
                              setRowDrag({ id, target: null });
                            }}
                            className="-ml-1 inline-flex h-6 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center text-subtle-foreground opacity-0 group-hover:opacity-100"
                          >
                            <GripVertical className="size-3.5" />
                          </button>
                        ) : null}
                        {row.hasChildren ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`${row.expanded ? 'Recolher' : 'Expandir'} ${row.task.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggle(id);
                            }}
                            className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <ChevronRight
                              aria-hidden="true"
                              className={cn(
                                'size-3.5 transition-transform duration-(--duration-fast)',
                                row.expanded && 'rotate-90',
                              )}
                            />
                          </button>
                        ) : (
                          <span
                            aria-hidden="true"
                            className="inline-flex size-5 shrink-0 items-center justify-center"
                          >
                            {isMilestone ? (
                              <Diamond className="size-3 fill-current text-muted-foreground" />
                            ) : null}
                          </span>
                        )}
                        <span className="truncate">{row.task.name}</span>
                        {isMilestone ? <span className="sr-only">(marco)</span> : null}
                        {isSummary ? <span className="sr-only">(tarefa resumo)</span> : null}
                        {row.task.mode === 'manual' && !isSummary ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex shrink-0 text-muted-foreground">
                                <Pin aria-hidden="true" className="size-3" />
                                <span className="sr-only">Agendamento manual</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Agendamento manual: a tarefa não se move com os vínculos.
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        {issues.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex shrink-0 text-destructive">
                                <TriangleAlert aria-hidden="true" className="size-3.5" />
                                <span className="sr-only">
                                  {issues.map((issue) => issue.message).join(' ')}
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-72">
                              {issues.map((issue) => issue.message).join(' ')}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        {!readOnly ? (
                          <RowMenu
                            open={menuRowId === id}
                            onOpenChange={(open) => {
                              setMenuRowId(open ? id : null);
                              if (!open) focusCell(cell);
                            }}
                            taskName={row.task.name}
                            isSummary={isSummary}
                            isMilestone={isMilestone}
                            mode={row.task.mode}
                            onAddTask={() => {
                              onTaskCreated(actions.addTask(id));
                            }}
                            onAddSubtask={() => {
                              onTaskCreated(actions.addSubtask(id));
                            }}
                            onIndent={() => {
                              actions.indent(id);
                            }}
                            onOutdent={() => {
                              actions.outdent(id);
                            }}
                            onMove={(direction) => {
                              actions.move(id, direction);
                            }}
                            onDuplicate={() => {
                              actions.duplicate(id);
                            }}
                            onToggleMilestone={() => {
                              actions.update(id, { duration: isMilestone ? 1 : 0 });
                            }}
                            onToggleMode={() => {
                              actions.update(id, {
                                mode: row.task.mode === 'auto' ? 'manual' : 'auto',
                              });
                            }}
                            onDelete={() => {
                              onRequestDelete(id);
                            }}
                            onEditLinks={() => {
                              onEditLinks?.(id);
                            }}
                            trigger={
                              <button
                                type="button"
                                tabIndex={-1}
                                aria-label={`Ações de ${row.task.name}`}
                                className={cn(
                                  'ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100',
                                  isSelected && 'opacity-100',
                                )}
                              >
                                <Ellipsis aria-hidden="true" className="size-4" />
                              </button>
                            }
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="truncate">{renderDisplay(column.key, row, scheduled)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

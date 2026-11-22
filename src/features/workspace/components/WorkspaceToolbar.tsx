import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  IndentDecrease,
  IndentIncrease,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { LocateFixed } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getChildren } from '@/features/schedule/lib/tree';
import { ZoomControls } from '@/features/timeline/components/ZoomControls';
import { formatVisibleRange } from '@/features/timeline/lib/format';
import { getVisibleRange } from '@/features/timeline/lib/scale';
import { useViewportStoreApi } from '@/features/timeline/store/viewportContext';
import type { UUID } from '@/types/project';

import type { WorkspaceModel } from '../hooks/useWorkspaceModel';
import { useWorkspaceUiStore } from '../store/workspaceUiStore';

interface WorkspaceToolbarProps {
  model: WorkspaceModel;
  /** Whole schedule, for the chart's "fit" button. */
  fitExtent: { start: number; end: number } | null;
  selectedId: UUID | null;
  onAddTask: () => void;
  onAddSubtask: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

function ToolButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 text-muted-foreground">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Commands that act on the selected task, plus expansion and the text filter. */
export function WorkspaceToolbar({
  model,
  fitExtent,
  selectedId,
  onAddTask,
  onAddSubtask,
  onIndent,
  onOutdent,
  onMove,
  onDelete,
}: WorkspaceToolbarProps) {
  const expandAll = useWorkspaceUiStore((state) => state.expandAll);
  const collapseAll = useWorkspaceUiStore((state) => state.collapseAll);
  const filterText = useWorkspaceUiStore((state) => state.filterText);
  const setFilterText = useWorkspaceUiStore((state) => state.setFilterText);
  const viewport = useViewportStoreApi();
  const goToToday = viewport((state) => state.goToToday);
  const rangeLabel = viewport((state) => {
    if (state.viewport.widthPx <= 0) return '';
    const { from, to } = getVisibleRange(state.viewport);
    return formatVisibleRange(from, to);
  });

  const selected = selectedId ? model.index.byId.get(selectedId) : undefined;
  const siblings = selected ? getChildren(model.index, selected.parentId) : [];
  const position = selected ? siblings.findIndex((task) => task.id === selected.id) : -1;
  const hasSelection = selected !== undefined;

  return (
    <div
      role="toolbar"
      aria-label="Ações do cronograma"
      className="no-scrollbar flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b bg-background px-2"
    >
      <Button size="sm" onClick={onAddTask}>
        <Plus />
        <span className="sr-only sm:not-sr-only">Nova tarefa</span>
      </Button>
      <ToolButton label="Nova subtarefa" disabled={!hasSelection} onClick={onAddSubtask}>
        <CornerDownRight />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <ToolButton
        label="Recuar (tornar subtarefa)"
        shortcut="Alt+Shift+→"
        disabled={!hasSelection || position <= 0}
        onClick={onIndent}
      >
        <IndentIncrease />
      </ToolButton>
      <ToolButton
        label="Avançar (subir um nível)"
        shortcut="Alt+Shift+←"
        disabled={selected?.parentId == null}
        onClick={onOutdent}
      >
        <IndentDecrease />
      </ToolButton>
      <ToolButton
        label="Mover para cima"
        shortcut="Alt+Shift+↑"
        disabled={!hasSelection || position <= 0}
        onClick={() => {
          onMove(-1);
        }}
      >
        <ArrowUp />
      </ToolButton>
      <ToolButton
        label="Mover para baixo"
        shortcut="Alt+Shift+↓"
        disabled={!hasSelection || position === -1 || position >= siblings.length - 1}
        onClick={() => {
          onMove(1);
        }}
      >
        <ArrowDown />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <ToolButton
        label="Expandir tudo"
        disabled={model.summaryIds.length === 0}
        onClick={expandAll}
      >
        <ChevronsUpDown />
      </ToolButton>
      <ToolButton
        label="Recolher tudo"
        disabled={model.summaryIds.length === 0}
        onClick={() => {
          collapseAll(model.summaryIds);
        }}
      >
        <ChevronsDownUp />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <ToolButton
        label="Excluir tarefa"
        shortcut="Delete"
        disabled={!hasSelection}
        onClick={onDelete}
      >
        <Trash2 />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5!" />
      <ToolButton label="Ir para hoje" shortcut="T" onClick={goToToday}>
        <LocateFixed />
      </ToolButton>
      <ZoomControls fitExtent={fitExtent} fitLabel="Ajustar ao projeto" />
      {rangeLabel ? (
        <span className="ml-1 hidden text-sm whitespace-nowrap text-muted-foreground capitalize xl:inline">
          {rangeLabel}
        </span>
      ) : null}

      <label className="ml-auto flex h-8 min-w-40 items-center gap-1.5 rounded-md border bg-background px-2 text-sm focus-within:border-ring">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="sr-only">Filtrar tarefas</span>
        <input
          type="search"
          value={filterText}
          placeholder="Filtrar tarefas"
          onChange={(event) => {
            setFilterText(event.target.value);
          }}
          className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </label>
    </div>
  );
}

import {
  ArrowDown,
  ArrowUp,
  Copy,
  CornerDownRight,
  Diamond,
  IndentDecrease,
  IndentIncrease,
  ListPlus,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SchedulingMode } from '@/types/schedule';

interface RowMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  taskName: string;
  isSummary: boolean;
  isMilestone: boolean;
  mode: SchedulingMode;
  onAddTask: () => void;
  onAddSubtask: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onToggleMilestone: () => void;
  onToggleMode: () => void;
  onDelete: () => void;
}

/** Row actions: opened from the "…" button, a right click or Shift+F10 on the row. */
export function RowMenu({
  open,
  onOpenChange,
  trigger,
  taskName,
  isSummary,
  isMilestone,
  mode,
  onAddTask,
  onAddSubtask,
  onIndent,
  onOutdent,
  onMove,
  onDuplicate,
  onToggleMilestone,
  onToggleMode,
  onDelete,
}: RowMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{taskName}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onAddTask}>
          <ListPlus />
          Nova tarefa abaixo
          <DropdownMenuShortcut>Insert</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddSubtask}>
          <CornerDownRight />
          Nova subtarefa
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onIndent}>
          <IndentIncrease />
          Recuar (tornar subtarefa)
          <DropdownMenuShortcut>Alt⇧→</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOutdent}>
          <IndentDecrease />
          Avançar (subir um nível)
          <DropdownMenuShortcut>Alt⇧←</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onMove(-1);
          }}
        >
          <ArrowUp />
          Mover para cima
          <DropdownMenuShortcut>Alt⇧↑</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onMove(1);
          }}
        >
          <ArrowDown />
          Mover para baixo
          <DropdownMenuShortcut>Alt⇧↓</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy />
          Duplicar (sem vínculos)
        </DropdownMenuItem>
        {!isSummary ? (
          <>
            <DropdownMenuItem onSelect={onToggleMilestone}>
              <Diamond />
              {isMilestone ? 'Converter em tarefa' : 'Converter em marco'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleMode}>
              {mode === 'auto' ? <Pin /> : <PinOff />}
              {mode === 'auto' ? 'Agendar manualmente' : 'Agendar automaticamente'}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Excluir…
          <DropdownMenuShortcut>Delete</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

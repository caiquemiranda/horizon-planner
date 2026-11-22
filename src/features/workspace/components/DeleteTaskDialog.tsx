import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button-variants';
import { getDescendantIds } from '@/features/schedule/lib/tree';
import type { UUID } from '@/types/project';

import type { WorkspaceModel } from '../hooks/useWorkspaceModel';

interface DeleteTaskDialogProps {
  model: WorkspaceModel;
  taskId: UUID | null;
  onCancel: () => void;
  onConfirm: (id: UUID) => void;
}

function plural(count: number, one: string, many: string) {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * Confirms a deletion stating exactly what goes away: the task, its subtasks and every
 * link touching them (cascade policy, so no orphans are left).
 */
export function DeleteTaskDialog({ model, taskId, onCancel, onConfirm }: DeleteTaskDialogProps) {
  const task = taskId ? model.index.byId.get(taskId) : undefined;
  const removed = task
    ? new Set([task.id, ...getDescendantIds(model.index, task.id)])
    : new Set<UUID>();
  const linkCount = model.schedule.dependencies.filter(
    (link) => removed.has(link.predecessorId) || removed.has(link.successorId),
  ).length;
  const subtaskCount = removed.size - 1;

  const consequences = [
    subtaskCount > 0 ? plural(subtaskCount, 'subtarefa', 'subtarefas') : null,
    linkCount > 0 ? plural(linkCount, 'vínculo', 'vínculos') : null,
  ].filter((item): item is string => item !== null);

  return (
    <AlertDialog
      open={task !== undefined}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir “{task ? model.describeTask(task.id) : ''}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {consequences.length > 0 ? `Também serão excluídos: ${consequences.join(' e ')}. ` : ''}
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={() => {
              if (task) onConfirm(task.id);
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

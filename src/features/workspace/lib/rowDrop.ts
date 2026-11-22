import { getChildren, type TreeIndex } from '@/features/schedule/lib/tree';
import type { UUID } from '@/types/project';

/**
 * Where a dragged table row lands: before or after the target row (same parent), or
 * inside it (as its last subtask). Pure, so the drop rules are tested without a browser.
 */
export type DropZone = 'before' | 'after' | 'inside';

export interface DropTarget {
  rowId: UUID;
  zone: DropZone;
}

/** Top quarter: before; bottom quarter: after; the middle: inside. */
export function getDropZone(ratio: number): DropZone {
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}

/**
 * The `moveTask` arguments for a drop, or `null` when it would not change anything.
 * Positions count the target's siblings without the dragged task (as `moveTask` does).
 * Invalid moves (into itself, under a linked task) are left to the domain commands,
 * which refuse them with a message.
 */
export function getDropMove(
  index: TreeIndex,
  draggedId: UUID,
  target: DropTarget,
): { parentId: UUID | null; position: number } | null {
  if (target.rowId === draggedId) return null;
  const targetTask = index.byId.get(target.rowId);
  const dragged = index.byId.get(draggedId);
  if (!targetTask || !dragged) return null;

  if (target.zone === 'inside') {
    if (dragged.parentId === targetTask.id) return null;
    return { parentId: targetTask.id, position: Number.POSITIVE_INFINITY };
  }

  const siblings = getChildren(index, targetTask.parentId).filter((task) => task.id !== draggedId);
  const at = siblings.findIndex((task) => task.id === targetTask.id);
  const position = target.zone === 'before' ? at : at + 1;

  if (dragged.parentId === targetTask.parentId) {
    const current = getChildren(index, dragged.parentId).findIndex((task) => task.id === draggedId);
    if (current === position) return null;
  }
  return { parentId: targetTask.parentId, position };
}

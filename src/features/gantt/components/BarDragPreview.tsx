import { formatCellDate } from '@/features/workspace/lib/cells';
import { WORKSPACE_METRICS } from '@/features/workspace/lib/columns';
import type { ScheduledTask } from '@/types/schedule';
import type { Viewport } from '@/types/timeline';

import type { BarChange } from '../lib/barDrag';
import { getBarGeometry } from '../lib/geometry';

interface BarDragPreviewProps {
  preview: { task: ScheduledTask; change: BarChange };
  rowIndex: number;
  viewport: Viewport;
}

/**
 * Where the bar will land, shown while dragging: a dashed outline at the snapped
 * position and the new dates. Nothing is saved until the pointer is released.
 */
export function BarDragPreview({ preview, rowIndex, viewport }: BarDragPreviewProps) {
  const { task, change } = preview;
  const geometry = getBarGeometry(
    { ...task, start: change.start, finish: change.finish },
    rowIndex,
    viewport,
    WORKSPACE_METRICS.rowHeight,
  );
  const lastDay = change.finish > change.start ? change.finish - 1 : change.start;
  const label =
    task.kind === 'milestone'
      ? formatCellDate(change.start)
      : `${formatCellDate(change.start)} – ${formatCellDate(lastDay)}`;

  return (
    <>
      {task.kind === 'milestone' ? (
        <div
          data-testid="bar-drag-preview"
          className="pointer-events-none absolute rotate-45 rounded-[2px] border-2 border-dashed border-ring"
          style={{
            left: geometry.x - geometry.height / 2 + 2,
            top: geometry.top + 2,
            width: geometry.height - 4,
            height: geometry.height - 4,
          }}
        />
      ) : (
        <div
          data-testid="bar-drag-preview"
          className="pointer-events-none absolute rounded-[4px] border-2 border-dashed border-ring bg-ring/10"
          style={{
            left: geometry.x,
            top: geometry.top,
            width: geometry.width,
            height: geometry.height,
          }}
        />
      )}
      <span
        className="pointer-events-none absolute z-20 rounded-md border bg-popover px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-popover-foreground tabular-nums shadow-popover"
        style={{ left: geometry.x, top: geometry.top - 24 }}
      >
        {label}
      </span>
    </>
  );
}

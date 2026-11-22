import { dayToX } from '@/features/timeline/lib/scale';
import type { UUID } from '@/types/project';
import type { ScheduledTask, TaskKind } from '@/types/schedule';
import type { Viewport } from '@/types/timeline';

/**
 * Gantt geometry: where each visible task is drawn. Pure functions of the schedule
 * result, the shared list of visible rows and the viewport, so bars and (later)
 * connectors always agree, and nothing here feeds back into dates.
 *
 * X comes from the timeline scale (`dayToX`): a task drawn over `[start, finish)` spans
 * exactly its working days. Y is the row index times the row height, the same rows the
 * table renders, so a bar and its table row share their vertical position.
 */

export const GANTT_METRICS = {
  /** Height of a task bar inside its row. */
  barHeight: 20,
  /** Height of a summary bar (thinner, with bracket ends). */
  summaryHeight: 8,
  /** Side of the milestone diamond. */
  milestoneSize: 14,
  /** Bars never get narrower than this, so short tasks stay visible and clickable. */
  minBarWidth: 3,
} as const;

export interface BarGeometry {
  id: UUID;
  kind: TaskKind;
  rowIndex: number;
  /** Left edge (milestones: center) relative to the viewport, in px. */
  x: number;
  width: number;
  /** Vertical center of the row, relative to the first row. */
  centerY: number;
  /** Top and height of the drawn shape. */
  top: number;
  height: number;
}

export function getBarGeometry(
  task: ScheduledTask,
  rowIndex: number,
  viewport: Viewport,
  rowHeight: number,
): BarGeometry {
  const centerY = rowIndex * rowHeight + rowHeight / 2;
  const startX = dayToX(task.start, viewport);

  if (task.kind === 'milestone') {
    const size = GANTT_METRICS.milestoneSize;
    return {
      id: task.id,
      kind: 'milestone',
      rowIndex,
      x: startX,
      width: 0,
      centerY,
      top: centerY - size / 2,
      height: size,
    };
  }

  const width = Math.max(GANTT_METRICS.minBarWidth, (task.finish - task.start) * viewport.pxPerDay);
  const height = task.kind === 'summary' ? GANTT_METRICS.summaryHeight : GANTT_METRICS.barHeight;
  return {
    id: task.id,
    kind: task.kind,
    rowIndex,
    x: startX,
    width,
    centerY,
    top: centerY - height / 2,
    height,
  };
}

/** Whether a horizontal span is (at least partly) inside the visible area. */
export function isHorizontallyVisible(
  geometry: BarGeometry,
  viewport: Viewport,
  margin = 200,
): boolean {
  const left =
    geometry.kind === 'milestone' ? geometry.x - GANTT_METRICS.milestoneSize : geometry.x;
  const right =
    geometry.kind === 'milestone'
      ? geometry.x + GANTT_METRICS.milestoneSize
      : geometry.x + geometry.width;
  return right >= -margin && left <= viewport.widthPx + margin;
}

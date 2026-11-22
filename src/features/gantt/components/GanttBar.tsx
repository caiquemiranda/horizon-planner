import { memo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getDisplayFinish } from '@/features/schedule/lib/engine';
import {
  formatCellDate,
  formatDuration,
  getTaskStatus,
  TASK_STATUS_LABELS,
} from '@/features/workspace/lib/cells';
import { cn } from '@/lib/utils';
import type { ScheduledTask } from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

import type { BarGeometry } from '../lib/geometry';

interface GanttBarProps {
  geometry: BarGeometry;
  task: ScheduledTask;
  name: string;
  wbs: string;
  today: DayNumber;
  selected: boolean;
  highlighted: boolean;
  manual: boolean;
}

/**
 * One task on the chart. Shape encodes the kind (not only color):
 * - task: a bar with a darker progress fill from the left;
 * - summary: a thin bar with bracket ends, spanning its descendants;
 * - milestone: a diamond on its day.
 * Tasks with issues get a dashed outline and the explanation in the tooltip.
 */
export const GanttBar = memo(function GanttBar({
  geometry,
  task,
  name,
  wbs,
  today,
  selected,
  highlighted,
  manual,
}: GanttBarProps) {
  const status = getTaskStatus(task, today);
  const hasIssues = task.issues.length > 0;
  const finish = getDisplayFinish(task);

  const shape =
    geometry.kind === 'milestone' ? (
      <div
        data-bar-id={task.id}
        data-kind="milestone"
        className="absolute"
        style={{
          left: geometry.x - geometry.height / 2,
          top: geometry.top,
          width: geometry.height,
          height: geometry.height,
        }}
      >
        <div
          className={cn(
            'size-full scale-[0.72] rotate-45 rounded-[2px] border-2 border-foreground bg-foreground',
            task.progress < 100 && 'bg-background',
            selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
            hasIssues && 'border-dashed border-destructive',
          )}
        />
      </div>
    ) : geometry.kind === 'summary' ? (
      <div
        data-bar-id={task.id}
        data-kind="summary"
        className={cn(
          'absolute rounded-[1px] bg-foreground/75',
          selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
          highlighted && 'bg-foreground',
        )}
        style={{
          left: geometry.x,
          top: geometry.top,
          width: geometry.width,
          height: geometry.height,
        }}
      >
        {/* Bracket ends: the summary covers everything between them. */}
        <span className="absolute top-full left-0 size-0 border-t-[6px] border-r-[6px] border-t-foreground/75 border-r-transparent" />
        <span className="absolute top-full right-0 size-0 border-t-[6px] border-l-[6px] border-t-foreground/75 border-l-transparent" />
      </div>
    ) : (
      <div
        data-bar-id={task.id}
        data-kind="task"
        className={cn(
          'absolute overflow-hidden rounded-[4px] border border-[color-mix(in_oklab,var(--gantt-bar)_70%,transparent)] bg-[color-mix(in_oklab,var(--gantt-bar)_28%,var(--surface-sunken))]',
          selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
          highlighted && 'brightness-110',
          hasIssues && 'border-dashed border-destructive',
          status === 'late' && 'border-destructive',
        )}
        style={{
          left: geometry.x,
          top: geometry.top,
          width: geometry.width,
          height: geometry.height,
        }}
      >
        <div
          className="h-full bg-[color-mix(in_oklab,var(--gantt-bar)_75%,transparent)]"
          style={{ width: `${String(task.progress)}%` }}
        />
      </div>
    );

  const labelX =
    geometry.kind === 'milestone'
      ? geometry.x + geometry.height / 2 + 6
      : geometry.x + geometry.width + 6;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{shape}</TooltipTrigger>
        <TooltipContent variant="card" side="top" className="w-64">
          <p className="text-xs font-semibold">
            <span className="mr-1 font-mono text-muted-foreground">{wbs}</span>
            {name}
          </p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Início</dt>
            <dd className="tabular-nums">{formatCellDate(task.start)}</dd>
            <dt className="text-muted-foreground">Término</dt>
            <dd className="tabular-nums">{formatCellDate(finish)}</dd>
            <dt className="text-muted-foreground">Duração</dt>
            <dd>{task.kind === 'milestone' ? 'Marco' : formatDuration(task.duration)}</dd>
            <dt className="text-muted-foreground">Progresso</dt>
            <dd className="tabular-nums">{task.progress}%</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              {TASK_STATUS_LABELS[status]}
              {manual ? ' · manual' : ''}
            </dd>
          </dl>
          {hasIssues ? (
            <p className="mt-1.5 text-xs text-destructive">
              {task.issues.map((issue) => issue.message).join(' ')}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
      <span
        className={cn(
          // A halo in the canvas color keeps the name readable where a connector crosses it.
          'pointer-events-none absolute z-[1] truncate text-xs whitespace-nowrap text-muted-foreground [text-shadow:0_0_3px_var(--surface-sunken),0_0_2px_var(--surface-sunken),0_0_1px_var(--surface-sunken)]',
          task.kind === 'summary' && 'font-semibold text-foreground',
        )}
        style={{ left: labelX, top: geometry.centerY - 8, lineHeight: '16px', maxWidth: 260 }}
      >
        {name}
      </span>
    </>
  );
});

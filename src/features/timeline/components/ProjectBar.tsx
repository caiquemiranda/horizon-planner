import { Check } from 'lucide-react';
import { type CSSProperties, memo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { COLOR_META } from '@/features/projects/constants';
import { cn } from '@/lib/utils';
import type { Project, ProjectStatus, UUID } from '@/types/project';
import type { ProjectBarLayout } from '@/types/timeline';

import { TIMELINE_METRICS } from '../constants';
import { ProjectTooltipContent } from './ProjectTooltipContent';

/** Vertical gap between the bar and its row edges. */
const BAR_INSET_Y = 6;
/** Minimum bar width before the title is drawn inside it. */
const MIN_LABEL_WIDTH_PX = 48;
/** Minimum bar width before the progress percentage is drawn on the right. */
const MIN_PERCENT_WIDTH_PX = 160;

/** Status is encoded by texture and opacity, never by a new color (see docs/design.md). */
const STATUS_CLASS_NAMES: Record<ProjectStatus, string> = {
  planned: 'border-dashed',
  in_progress: '',
  paused: 'bar-striped',
  completed: 'opacity-70',
  cancelled: 'opacity-45 [&_[data-slot=bar-title]]:line-through',
};

interface ProjectBarProps {
  project: Project;
  layout: ProjectBarLayout;
  /** Top of the project's row, in px from the top of the timeline body. */
  rowTop: number;
  highlighted?: boolean;
  /** Called with the project id on pointer enter and `null` on leave. Must be stable. */
  onHoverChange?: (projectId: UUID | null) => void;
}

export const ProjectBar = memo(function ProjectBar({
  project,
  layout,
  rowTop,
  highlighted = false,
  onHoverChange,
}: ProjectBarProps) {
  const { x, width, milestoneXs } = layout;
  const height = TIMELINE_METRICS.rowHeight - BAR_INSET_Y * 2;
  // Keeps the title readable when the bar starts before the visible area.
  const labelOffset = Math.max(0, Math.min(-x, width - MIN_LABEL_WIDTH_PX));
  const isCompleted = project.status === 'completed';

  const style = {
    '--project-color': `var(${COLOR_META[project.color].cssVar})`,
    left: x,
    top: rowTop + BAR_INSET_Y,
    width,
    height,
  } as CSSProperties;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-project-id={project.id}
          data-highlighted={highlighted || undefined}
          aria-label={project.title}
          onPointerEnter={() => onHoverChange?.(project.id)}
          onPointerLeave={() => onHoverChange?.(null)}
          className={cn(
            'group absolute flex items-center gap-1.5 overflow-hidden rounded-md border pr-2 pl-2.5 text-left',
            'border-[color-mix(in_oklab,var(--project-color)_50%,transparent)]',
            'bg-[color-mix(in_oklab,var(--project-color)_16%,var(--surface-sunken))]',
            'transition-[box-shadow,filter,opacity] duration-(--duration-fast) ease-out-expo',
            'hover:brightness-110 data-highlighted:shadow-[0_0_0_1px_var(--project-color)]',
            'focus-visible:shadow-[0_0_0_2px_var(--project-color)] focus-visible:outline-none',
            STATUS_CLASS_NAMES[project.status],
          )}
          style={style}
        >
          {/* Solid rail on the left edge */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-0.5 bg-(--project-color)"
          />
          {/* Progress */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--project-color)_30%,transparent)]"
            style={{ width: `${String(project.progress)}%` }}
          />

          {width >= MIN_LABEL_WIDTH_PX ? (
            <span
              className="relative flex min-w-0 items-center gap-1"
              style={{ transform: `translateX(${String(labelOffset)}px)` }}
            >
              {isCompleted ? (
                <Check aria-hidden="true" className="size-3 shrink-0 text-(--project-color)" />
              ) : null}
              <span data-slot="bar-title" className="truncate text-xs font-medium text-foreground">
                {project.title}
              </span>
            </span>
          ) : null}

          {width >= MIN_PERCENT_WIDTH_PX && !isCompleted ? (
            <span
              aria-hidden="true"
              className="relative ml-auto font-mono text-[10px] text-muted-foreground tabular-nums"
            >
              {project.progress}%
            </span>
          ) : null}

          {milestoneXs.map((milestoneX, index) => {
            const milestone = project.milestones[index];
            if (!milestone) return null;

            return (
              <span
                key={milestone.id}
                aria-hidden="true"
                data-milestone-id={milestone.id}
                className={cn(
                  'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-[1.5px] border-(--project-color)',
                  milestone.completed ? 'bg-(--project-color)' : 'bg-background',
                )}
                style={{ left: milestoneX - x }}
              />
            );
          })}
        </button>
      </TooltipTrigger>
      <TooltipContent variant="card" side="top" align="center" sideOffset={8} collisionPadding={12}>
        <ProjectTooltipContent project={project} />
      </TooltipContent>
    </Tooltip>
  );
});

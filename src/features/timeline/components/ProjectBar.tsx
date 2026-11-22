import { type CSSProperties, memo } from 'react';

import { COLOR_META } from '@/features/projects/constants';
import { cn } from '@/lib/utils';
import type { Project, ProjectStatus } from '@/types/project';
import type { ProjectBarLayout } from '@/types/timeline';

import { TIMELINE_METRICS } from '../constants';

/** Vertical gap between the bar and its row edges. */
const BAR_INSET_Y = 6;
/** Minimum bar width before the title is drawn inside it. */
const MIN_LABEL_WIDTH_PX = 48;

const STATUS_CLASS_NAMES: Record<ProjectStatus, string> = {
  planned: 'border-dashed',
  in_progress: '',
  paused: 'bar-striped',
  completed: 'opacity-60',
  cancelled: 'opacity-40 [&_[data-slot=bar-title]]:line-through',
};

interface ProjectBarProps {
  project: Project;
  layout: ProjectBarLayout;
  /** Top of the project's row, in px from the top of the timeline body. */
  rowTop: number;
}

export const ProjectBar = memo(function ProjectBar({ project, layout, rowTop }: ProjectBarProps) {
  const { x, width, milestoneXs } = layout;
  const height = TIMELINE_METRICS.rowHeight - BAR_INSET_Y * 2;
  // Keeps the title readable when the bar starts before the visible area.
  const labelOffset = Math.max(0, Math.min(-x, width - MIN_LABEL_WIDTH_PX));

  const style = {
    '--project-color': `var(${COLOR_META[project.color].cssVar})`,
    left: x,
    top: rowTop + BAR_INSET_Y,
    width,
    height,
  } as CSSProperties;

  return (
    <button
      type="button"
      data-project-id={project.id}
      aria-label={project.title}
      className={cn(
        'group absolute flex items-center overflow-hidden rounded-md border text-left',
        'border-[color-mix(in_oklab,var(--project-color)_55%,transparent)]',
        'bg-[color-mix(in_oklab,var(--project-color)_16%,var(--surface-sunken))]',
        'transition-[box-shadow,filter] duration-150 ease-out-expo',
        'hover:shadow-[0_0_0_1px_var(--project-color)] hover:brightness-110',
        STATUS_CLASS_NAMES[project.status],
      )}
      style={style}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--project-color)_35%,transparent)]"
        style={{ width: `${String(project.progress)}%` }}
      />

      {width >= MIN_LABEL_WIDTH_PX ? (
        <span
          data-slot="bar-title"
          className="relative truncate px-2 text-xs font-medium text-foreground"
          style={{ transform: `translateX(${String(labelOffset)}px)` }}
        >
          {project.title}
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
              'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-(--project-color)',
              milestone.completed ? 'bg-(--project-color)' : 'bg-background',
            )}
            style={{ left: milestoneX - x }}
          />
        );
      })}
    </button>
  );
});

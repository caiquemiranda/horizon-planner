import { CalendarDays, Diamond } from 'lucide-react';
import type { CSSProperties } from 'react';

import { COLOR_META, HORIZON_META, STATUS_META } from '@/features/projects/constants';
import type { Project } from '@/types/project';

import { formatDateRange, formatDuration } from '../lib/format';

interface ProjectTooltipContentProps {
  project: Project;
}

/** Summary shown when hovering or focusing a project bar (rendered in a `card` tooltip). */
export function ProjectTooltipContent({ project }: ProjectTooltipContentProps) {
  const horizon = HORIZON_META[project.horizon];
  const completedMilestones = project.milestones.filter((milestone) => milestone.completed).length;
  // Tooltips are portaled, so the project color has to be set again here.
  const style = { '--project-color': `var(${COLOR_META[project.color].cssVar})` } as CSSProperties;

  return (
    <div className="flex w-64 flex-col gap-2.5 text-left" style={style}>
      <div className="flex flex-col gap-1">
        <span className="text-sm leading-snug font-semibold text-pretty">{project.title}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ backgroundColor: `var(${horizon.cssVar})` }}
          />
          {horizon.label}
          <span aria-hidden="true" className="text-subtle-foreground">
            ·
          </span>
          {STATUS_META[project.status].label}
          {project.category ? (
            <>
              <span aria-hidden="true" className="text-subtle-foreground">
                ·
              </span>
              {project.category}
            </>
          ) : null}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <CalendarDays aria-hidden="true" className="size-3.5 text-subtle-foreground" />
          {formatDateRange(project.startDate, project.endDate)}
          <span className="text-muted-foreground">
            · {formatDuration(project.startDate, project.endDate)}
          </span>
        </span>

        {project.milestones.length > 0 ? (
          <span className="flex items-center gap-1.5">
            <Diamond aria-hidden="true" className="size-3.5 text-subtle-foreground" />
            {completedMilestones} de {project.milestones.length} marcos concluídos
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Progresso"
          aria-valuenow={project.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-(--project-color)"
            style={{ width: `${String(project.progress)}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {project.progress}%
        </span>
      </div>
    </div>
  );
}

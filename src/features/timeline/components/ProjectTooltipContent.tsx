import { CalendarDays, Diamond } from 'lucide-react';

import { HORIZON_META, STATUS_META } from '@/features/projects/constants';
import type { Project } from '@/types/project';

import { formatDateRange, formatDuration } from '../lib/format';

interface ProjectTooltipContentProps {
  project: Project;
}

/** Summary shown when hovering or focusing a project bar. */
export function ProjectTooltipContent({ project }: ProjectTooltipContentProps) {
  const horizon = HORIZON_META[project.horizon];
  const completedMilestones = project.milestones.filter((milestone) => milestone.completed).length;

  return (
    <div className="flex w-64 flex-col gap-2 py-1 text-left">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm leading-snug font-semibold text-pretty">{project.title}</span>
        <span className="flex items-center gap-1.5 text-[11px] opacity-70">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ backgroundColor: `var(${horizon.cssVar})` }}
          />
          {horizon.label}
          <span aria-hidden="true">·</span>
          {STATUS_META[project.status].label}
          {project.category ? (
            <>
              <span aria-hidden="true">·</span>
              {project.category}
            </>
          ) : null}
        </span>
      </div>

      <span className="flex items-center gap-1.5 text-xs">
        <CalendarDays aria-hidden="true" className="size-3.5 opacity-70" />
        {formatDateRange(project.startDate, project.endDate)}
        <span className="opacity-60">({formatDuration(project.startDate, project.endDate)})</span>
      </span>

      {project.milestones.length > 0 ? (
        <span className="flex items-center gap-1.5 text-xs">
          <Diamond aria-hidden="true" className="size-3.5 opacity-70" />
          {completedMilestones} de {project.milestones.length} marcos concluídos
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Progresso"
          aria-valuenow={project.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 flex-1 overflow-hidden rounded-full bg-background/20"
        >
          <div
            className="h-full rounded-full bg-background"
            style={{ width: `${String(project.progress)}%` }}
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums">{project.progress}%</span>
      </div>
    </div>
  );
}

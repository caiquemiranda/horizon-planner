import { ChevronRight } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { COLOR_META, HORIZON_META, STATUS_META } from '@/features/projects/constants';
import { cn } from '@/lib/utils';
import type { Horizon, Project, UUID } from '@/types/project';

import { TIMELINE_METRICS } from '../constants';
import type { LaneLayout } from '../lib/layout';

const { laneHeaderHeight, rowHeight } = TIMELINE_METRICS;

interface LaneSidebarProps {
  lanes: readonly LaneLayout[];
  projectsById: ReadonlyMap<UUID, Project>;
  onToggleLane: (horizon: Horizon) => void;
  hoveredProjectId?: UUID | null;
  onHoverChange?: (projectId: UUID | null) => void;
  selectedProjectId?: UUID | null;
  onSelectProject?: (projectId: UUID) => void;
  /**
   * Narrow strip: lane markers and project dots, names in tooltips. Rows keep their height
   * (aligned with the bars) and every name stays in the accessible names.
   */
  compact?: boolean;
}

/** Left column: lane headers (collapsible) and one title per project row. */
export function LaneSidebar({
  lanes,
  projectsById,
  onToggleLane,
  hoveredProjectId = null,
  onHoverChange,
  selectedProjectId = null,
  onSelectProject,
  compact = false,
}: LaneSidebarProps) {
  return (
    <>
      {lanes.map((lane) => {
        const meta = HORIZON_META[lane.horizon];
        const laneId = `lane-${lane.horizon}`;

        const laneButton = (
          <button
            type="button"
            aria-expanded={!lane.collapsed}
            aria-controls={laneId}
            onClick={() => {
              onToggleLane(lane.horizon);
            }}
            title={compact ? undefined : meta.description}
            className={cn(
              'group flex w-full items-center gap-2 border-b text-left transition-colors duration-(--duration-fast) hover:bg-accent/60',
              compact ? 'justify-center gap-0.5 px-0' : 'px-3',
            )}
            style={{ height: laneHeaderHeight }}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'shrink-0 text-subtle-foreground transition-transform duration-(--duration-base) ease-out-expo group-hover:text-muted-foreground',
                compact ? 'size-3' : 'size-3.5',
                !lane.collapsed && 'rotate-90',
              )}
            />
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: `var(${meta.cssVar})` }}
            />
            <span
              id={`${laneId}-label`}
              className={cn('text-[13px] font-medium whitespace-nowrap', compact && 'sr-only')}
            >
              {meta.label}
            </span>
            <span
              className={cn(
                'ml-auto font-mono text-[11px] text-subtle-foreground tabular-nums',
                compact && 'sr-only',
              )}
            >
              {lane.projectCount}
            </span>
          </button>
        );

        return (
          <div key={lane.horizon} role="group" aria-labelledby={`${laneId}-label`}>
            {compact ? (
              <Tooltip>
                <TooltipTrigger asChild>{laneButton}</TooltipTrigger>
                <TooltipContent side="right">
                  {meta.label} · {lane.projectCount}
                </TooltipContent>
              </Tooltip>
            ) : (
              laneButton
            )}

            <ul id={laneId} aria-label={`Projetos de ${meta.label.toLowerCase()}`}>
              {lane.projectIds.map((projectId) => {
                const project = projectsById.get(projectId);
                if (!project) return null;

                return (
                  <li
                    key={projectId}
                    data-highlighted={hoveredProjectId === projectId || undefined}
                    data-selected={selectedProjectId === projectId || undefined}
                    onPointerEnter={() => onHoverChange?.(projectId)}
                    onPointerLeave={() => onHoverChange?.(null)}
                    className="border-b border-timeline-grid transition-colors duration-(--duration-fast) data-highlighted:bg-accent/60 data-selected:bg-accent"
                    style={{ height: rowHeight }}
                  >
                    <ProjectRowButton
                      project={project}
                      selected={selectedProjectId === projectId}
                      compact={compact}
                      onSelect={() => onSelectProject?.(projectId)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

interface ProjectRowButtonProps {
  project: Project;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
}

/** One project row; in the compact column, a dot with the name in a tooltip. */
function ProjectRowButton({ project, selected, compact, onSelect }: ProjectRowButtonProps) {
  const button = (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onSelect}
      className={cn(
        'flex size-full items-center gap-2 text-left outline-none focus-visible:bg-accent',
        compact ? 'justify-center px-0' : 'pr-3 pl-5 md:pl-8',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-[3px]', COLOR_META[project.color].swatchClassName)}
      />
      <span
        className={cn(
          'truncate text-sm',
          STATUS_META[project.status].isClosed && 'text-muted-foreground',
          project.status === 'cancelled' && 'line-through',
          compact && 'sr-only',
        )}
      >
        {project.title}
      </span>
      <span
        className={cn(
          'ml-auto font-mono text-[11px] text-muted-foreground tabular-nums',
          compact ? 'sr-only' : 'hidden md:inline',
        )}
      >
        {project.progress}%
      </span>
    </button>
  );
  if (!compact) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">
        {project.title} · {project.progress}%
      </TooltipContent>
    </Tooltip>
  );
}

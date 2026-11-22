import { ChevronRight } from 'lucide-react';

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
}: LaneSidebarProps) {
  return (
    <>
      {lanes.map((lane) => {
        const meta = HORIZON_META[lane.horizon];
        const laneId = `lane-${lane.horizon}`;

        return (
          <div key={lane.horizon} role="group" aria-labelledby={`${laneId}-label`}>
            <button
              type="button"
              aria-expanded={!lane.collapsed}
              aria-controls={laneId}
              onClick={() => {
                onToggleLane(lane.horizon);
              }}
              title={meta.description}
              className="group flex w-full items-center gap-2 border-b px-3 text-left transition-colors duration-(--duration-fast) hover:bg-accent/60"
              style={{ height: laneHeaderHeight }}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  'size-3.5 shrink-0 text-subtle-foreground transition-transform duration-(--duration-base) ease-out-expo group-hover:text-muted-foreground',
                  !lane.collapsed && 'rotate-90',
                )}
              />
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: `var(${meta.cssVar})` }}
              />
              <span id={`${laneId}-label`} className="text-[13px] font-medium whitespace-nowrap">
                {meta.label}
              </span>
              <span className="ml-auto font-mono text-[11px] text-subtle-foreground tabular-nums">
                {lane.projectCount}
              </span>
            </button>

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
                    <button
                      type="button"
                      aria-current={selectedProjectId === projectId || undefined}
                      onClick={() => onSelectProject?.(projectId)}
                      className="flex size-full items-center gap-2 pr-3 pl-5 text-left outline-none focus-visible:bg-accent md:pl-8"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-2 shrink-0 rounded-[3px]',
                          COLOR_META[project.color].swatchClassName,
                        )}
                      />
                      <span
                        className={cn(
                          'truncate text-sm',
                          STATUS_META[project.status].isClosed && 'text-muted-foreground',
                          project.status === 'cancelled' && 'line-through',
                        )}
                      >
                        {project.title}
                      </span>
                      <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground tabular-nums md:inline">
                        {project.progress}%
                      </span>
                    </button>
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

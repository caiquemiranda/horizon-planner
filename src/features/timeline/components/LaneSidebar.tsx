import { ChevronRight } from 'lucide-react';

import { COLOR_META, HORIZON_META } from '@/features/projects/constants';
import { cn } from '@/lib/utils';
import type { Horizon, Project, UUID } from '@/types/project';

import { TIMELINE_METRICS } from '../constants';
import type { LaneLayout } from '../lib/layout';

const { laneHeaderHeight, rowHeight } = TIMELINE_METRICS;

interface LaneSidebarProps {
  lanes: readonly LaneLayout[];
  projectsById: ReadonlyMap<UUID, Project>;
  onToggleLane: (horizon: Horizon) => void;
}

/** Left column: lane headers (collapsible) and one title per project row. */
export function LaneSidebar({ lanes, projectsById, onToggleLane }: LaneSidebarProps) {
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
              className="flex w-full items-center gap-2 border-b px-3 text-left transition-colors hover:bg-accent/50"
              style={{ height: laneHeaderHeight }}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
                  !lane.collapsed && 'rotate-90',
                )}
              />
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: `var(${meta.cssVar})` }}
              />
              <span id={`${laneId}-label`} className="text-sm font-medium whitespace-nowrap">
                {meta.label}
              </span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {meta.description}
              </span>
              <span className="ml-auto rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
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
                    className="flex items-center gap-2 border-b border-timeline-grid pr-3 pl-8"
                    style={{ height: rowHeight }}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2 shrink-0 rounded-xs',
                        COLOR_META[project.color].swatchClassName,
                      )}
                    />
                    <span className="truncate text-sm">{project.title}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                      {project.progress}%
                    </span>
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

import { Fragment, type ReactNode, useMemo, useRef, useState } from 'react';

import { type Horizon, HORIZONS, type Project, type UUID } from '@/types/project';

import { TIMELINE_METRICS } from '../constants';
import { useElementWidth } from '../hooks/useElementWidth';
import { usePointerNavigation } from '../hooks/usePointerNavigation';
import { useTodayDay } from '../hooks/useTodayDay';
import { useWheelNavigation } from '../hooks/useWheelNavigation';
import { computeBarLayouts, layoutLanes } from '../lib/layout';
import { useViewportStoreApi } from '../store/viewportContext';
import { GridLines } from './GridLines';
import { ProjectBar } from './ProjectBar';
import { TimelineEmptyState } from './TimelineEmptyState';
import { TimeRuler } from './TimeRuler';
import { TodayIndicator } from './TodayIndicator';

const { rulerHeight, rowHeight } = TIMELINE_METRICS;

interface TimelineProps {
  projects: readonly Project[];
  /** Project open in the drawer, highlighted on the timeline. */
  selectedProjectId?: UUID | null;
  /** Must be stable. */
  onSelectProject?: (projectId: UUID) => void;
  /** Lanes to show (default: all horizons). Must be stable. */
  horizons?: readonly Horizon[];
  /** Shown over the canvas when there are no projects (default: a generic empty state). */
  emptyState?: ReactNode;
}

/**
 * Gantt-like timeline over the whole width: one row per project, in the sidebar's order
 * (short, medium, then long term). Grouping, folding, filters and selection live in the
 * navigation sidebar, so the chart has no headers of its own; a stronger line separates
 * one horizon from the next and each bar carries its project's name.
 */
export function Timeline({
  projects,
  selectedProjectId = null,
  onSelectProject,
  horizons = HORIZONS,
  emptyState,
}: TimelineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportStore = useViewportStoreApi();
  const viewport = viewportStore((state) => state.viewport);
  const setWidth = viewportStore((state) => state.setWidth);
  const today = useTodayDay();
  const [hoveredProjectId, setHoveredProjectId] = useState<UUID | null>(null);

  useElementWidth(canvasRef, setWidth);
  useWheelNavigation(rootRef, canvasRef);
  usePointerNavigation(canvasRef, scrollRef);

  const { lanes, rows, totalHeight } = useMemo(
    () => layoutLanes(projects, { rowHeight, headerHeight: 0, horizons }),
    [projects, horizons],
  );
  const bars = useMemo(
    () => computeBarLayouts(projects, rows, viewport),
    [projects, rows, viewport],
  );
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const barsByLane = useMemo(() => {
    const byProject = new Map(bars.map((bar) => [bar.projectId, bar]));
    return new Map(
      lanes.map((lane) => [
        lane.horizon,
        lane.projectIds.flatMap((projectId) => byProject.get(projectId) ?? []),
      ]),
    );
  }, [bars, lanes]);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b bg-background" style={{ height: rulerHeight }}>
        <div className="relative min-w-0 flex-1">
          <TimeRuler viewport={viewport} />
          <TodayIndicator viewport={viewport} today={today} variant="ruler" />
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-full">
          {/*
           * `overflow-clip`, not `overflow-hidden`: a hidden overflow is still a scroll
           * container, and focusing a bar would scroll it out of sync with the ruler.
           */}
          <div
            ref={canvasRef}
            role="region"
            aria-label="Linha do tempo"
            className="relative min-w-0 flex-1 cursor-grab touch-pan-y overflow-clip select-none data-panning:cursor-grabbing"
            style={{ minHeight: totalHeight }}
          >
            <GridLines viewport={viewport} />

            {/* Row bands only: the horizon groups are named in the sidebar, not here. */}
            <div aria-hidden="true" className="pointer-events-none">
              {lanes.map((lane) => (
                <Fragment key={lane.horizon}>
                  {lane.projectIds.map((projectId, row) => (
                    <div
                      key={projectId}
                      data-highlighted={hoveredProjectId === projectId || undefined}
                      data-lane-start={row === 0 && lane.top > 0 ? '' : undefined}
                      className="absolute inset-x-0 border-b border-timeline-grid transition-colors duration-(--duration-fast) data-highlighted:bg-accent/40 data-lane-start:border-t data-lane-start:border-t-border"
                      style={{ top: lane.top + row * rowHeight, height: rowHeight }}
                    />
                  ))}
                </Fragment>
              ))}
            </div>

            <ul aria-label="Projetos">
              {lanes.flatMap((lane) =>
                (barsByLane.get(lane.horizon) ?? []).map((bar) => {
                  const project = projectsById.get(bar.projectId);
                  const position = rows.get(bar.projectId);
                  if (!project || !position) return null;
                  return (
                    <li key={bar.projectId}>
                      <ProjectBar
                        project={project}
                        layout={bar}
                        rowTop={position.top}
                        highlighted={hoveredProjectId === bar.projectId}
                        selected={selectedProjectId === bar.projectId}
                        {...(onSelectProject ? { onSelect: onSelectProject } : {})}
                        onHoverChange={setHoveredProjectId}
                      />
                    </li>
                  );
                }),
              )}
            </ul>

            <TodayIndicator viewport={viewport} today={today} variant="canvas" />

            {projects.length === 0 ? (emptyState ?? <TimelineEmptyState />) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

import { ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useId, useMemo, useRef, useState } from 'react';

import { HORIZON_META } from '@/features/projects/constants';
import { cn } from '@/lib/utils';
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

const { rulerHeight, laneHeaderHeight, rowHeight } = TIMELINE_METRICS;

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
 * Gantt-like timeline over the whole width: one band per horizon (foldable) and one row
 * per project. Projects are listed by name in the navigation sidebar, so there is no
 * second list here; each bar carries its project's name.
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<Horizon>>(() => new Set());
  const lanesId = useId();
  const [hoveredProjectId, setHoveredProjectId] = useState<UUID | null>(null);

  useElementWidth(canvasRef, setWidth);
  useWheelNavigation(rootRef, canvasRef);
  usePointerNavigation(canvasRef, scrollRef);

  const { lanes, rows, totalHeight } = useMemo(
    () => layoutLanes(projects, { rowHeight, headerHeight: laneHeaderHeight, collapsed, horizons }),
    [projects, collapsed, horizons],
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

  const toggleLane = useCallback((horizon: Horizon) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(horizon)) next.add(horizon);
      return next;
    });
  }, []);

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

            {lanes.map((lane) => (
              <div key={lane.horizon} aria-hidden="true" className="pointer-events-none">
                <div
                  className="absolute inset-x-0 border-b bg-background/50"
                  style={{ top: lane.top, height: laneHeaderHeight }}
                />
                {lane.projectIds.map((projectId, row) => (
                  <div
                    key={projectId}
                    data-highlighted={hoveredProjectId === projectId || undefined}
                    className="absolute inset-x-0 border-b border-timeline-grid transition-colors duration-(--duration-fast) data-highlighted:bg-accent/40"
                    style={{
                      top: lane.top + laneHeaderHeight + row * rowHeight,
                      height: rowHeight,
                    }}
                  />
                ))}
              </div>
            ))}

            {lanes.map((lane) => {
              const meta = HORIZON_META[lane.horizon];
              const listId = `${lanesId}-${lane.horizon}`;
              return (
                <div key={lane.horizon} role="group" aria-labelledby={`${listId}-label`}>
                  {/* The band's title: folds the lane (its projects stay in the sidebar). */}
                  <button
                    type="button"
                    aria-expanded={!lane.collapsed}
                    aria-controls={listId}
                    title={meta.description}
                    onClick={() => {
                      toggleLane(lane.horizon);
                    }}
                    className="group absolute left-2 z-10 my-1 flex items-center gap-1.5 rounded-md px-1.5 text-left transition-colors duration-(--duration-fast) hover:bg-accent/60"
                    style={{ top: lane.top, height: laneHeaderHeight - 8 }}
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
                    <span
                      id={`${listId}-label`}
                      className="text-[13px] font-medium whitespace-nowrap"
                    >
                      {meta.label}
                    </span>
                    <span className="font-mono text-[11px] text-subtle-foreground tabular-nums">
                      {lane.projectCount}
                    </span>
                  </button>
                  {lane.collapsed ? null : (
                    <ul id={listId} aria-label={`Projetos de ${meta.label.toLowerCase()}`}>
                      {(barsByLane.get(lane.horizon) ?? []).map((bar) => {
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
                      })}
                    </ul>
                  )}
                </div>
              );
            })}

            <TodayIndicator viewport={viewport} today={today} variant="canvas" />

            {projects.length === 0 ? (emptyState ?? <TimelineEmptyState />) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

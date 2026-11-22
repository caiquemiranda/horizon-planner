import { useCallback, useMemo, useRef, useState } from 'react';

import type { Horizon, Project } from '@/types/project';

import { TIMELINE_METRICS } from '../constants';
import { useElementWidth } from '../hooks/useElementWidth';
import { useTodayDay } from '../hooks/useTodayDay';
import { computeBarLayouts, layoutLanes } from '../lib/layout';
import { useViewportStore } from '../store/viewportStore';
import { GridLines } from './GridLines';
import { LaneSidebar } from './LaneSidebar';
import { ProjectBar } from './ProjectBar';
import { TimelineEmptyState } from './TimelineEmptyState';
import { TimeRuler } from './TimeRuler';
import { TodayIndicator } from './TodayIndicator';

const { rulerHeight, laneHeaderHeight, rowHeight, sidebarWidth } = TIMELINE_METRICS;

interface TimelineProps {
  projects: readonly Project[];
}

/**
 * Gantt-like timeline: a fixed sidebar with the horizon lanes on the left and the
 * time canvas on the right. Only the canvas width feeds the viewport.
 */
export function Timeline({ projects }: TimelineProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewport = useViewportStore((state) => state.viewport);
  const setWidth = useViewportStore((state) => state.setWidth);
  const today = useTodayDay();
  const [collapsed, setCollapsed] = useState<ReadonlySet<Horizon>>(() => new Set());

  useElementWidth(canvasRef, setWidth);

  const { lanes, rows, totalHeight } = useMemo(
    () => layoutLanes(projects, { rowHeight, headerHeight: laneHeaderHeight, collapsed }),
    [projects, collapsed],
  );
  const bars = useMemo(
    () => computeBarLayouts(projects, rows, viewport),
    [projects, rows, viewport],
  );
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const toggleLane = useCallback((horizon: Horizon) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(horizon)) next.add(horizon);
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b bg-background" style={{ height: rulerHeight }}>
        <div className="flex shrink-0 items-end border-r px-4 pb-2" style={{ width: sidebarWidth }}>
          <span className="text-label">Horizontes</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <TimeRuler viewport={viewport} />
          <TodayIndicator viewport={viewport} today={today} variant="ruler" />
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-full">
          <section
            aria-label="Horizontes"
            className="shrink-0 border-r bg-background"
            style={{ width: sidebarWidth }}
          >
            <LaneSidebar lanes={lanes} projectsById={projectsById} onToggleLane={toggleLane} />
          </section>

          <div
            ref={canvasRef}
            role="region"
            aria-label="Linha do tempo"
            className="relative min-w-0 flex-1 overflow-hidden"
            style={{ minHeight: totalHeight }}
          >
            <GridLines viewport={viewport} />

            {lanes.map((lane) => (
              <div key={lane.horizon} aria-hidden="true" className="pointer-events-none">
                <div
                  className="absolute inset-x-0 border-b bg-background/40"
                  style={{ top: lane.top, height: laneHeaderHeight }}
                />
                {lane.projectIds.map((projectId, row) => (
                  <div
                    key={projectId}
                    className="absolute inset-x-0 border-b border-timeline-grid"
                    style={{
                      top: lane.top + laneHeaderHeight + row * rowHeight,
                      height: rowHeight,
                    }}
                  />
                ))}
              </div>
            ))}

            {bars.map((bar) => {
              const project = projectsById.get(bar.projectId);
              const position = rows.get(bar.projectId);
              if (!project || !position) return null;

              return (
                <ProjectBar
                  key={bar.projectId}
                  project={project}
                  layout={bar}
                  rowTop={position.top}
                />
              );
            })}

            <TodayIndicator viewport={viewport} today={today} variant="canvas" />

            {projects.length === 0 ? <TimelineEmptyState /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

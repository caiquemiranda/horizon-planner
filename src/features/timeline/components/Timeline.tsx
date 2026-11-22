import { useRef } from 'react';

import { HORIZON_META } from '@/features/projects/constants';
import { HORIZONS } from '@/types/project';

import { TIMELINE_METRICS } from '../constants';
import { useElementWidth } from '../hooks/useElementWidth';
import { useViewportStore } from '../store/viewportStore';
import { GridLines } from './GridLines';
import { TimelineEmptyState } from './TimelineEmptyState';
import { TimeRuler } from './TimeRuler';

const { rulerHeight, laneHeaderHeight, sidebarWidth } = TIMELINE_METRICS;

/**
 * Gantt-like timeline: a fixed sidebar with the horizon lanes on the left and the
 * time canvas on the right. Only the canvas width feeds the viewport.
 */
export function Timeline() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewport = useViewportStore((state) => state.viewport);
  const setWidth = useViewportStore((state) => state.setWidth);

  useElementWidth(canvasRef, setWidth);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b bg-background" style={{ height: rulerHeight }}>
        <div className="flex shrink-0 items-end border-r px-4 pb-2" style={{ width: sidebarWidth }}>
          <span className="text-label">Horizontes</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <TimeRuler viewport={viewport} />
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-full">
          <section
            aria-label="Horizontes"
            className="shrink-0 border-r bg-background"
            style={{ width: sidebarWidth }}
          >
            {HORIZONS.map((horizon) => {
              const meta = HORIZON_META[horizon];
              return (
                <div
                  key={horizon}
                  className="flex items-center gap-2 border-b px-4"
                  style={{ height: laneHeaderHeight }}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: `var(${meta.cssVar})` }}
                  />
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{meta.description}</span>
                </div>
              );
            })}
          </section>

          <div ref={canvasRef} className="relative min-w-0 flex-1 overflow-hidden">
            <GridLines viewport={viewport} />
            <TimelineEmptyState />
          </div>
        </div>
      </div>
    </div>
  );
}

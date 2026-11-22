import { memo, useMemo } from 'react';

import type { Tick, Viewport } from '@/types/timeline';

import { TIMELINE_METRICS } from '../constants';
import { generateTicks, getGranularity } from '../lib/ticks';

/** Approximate width reserved for a major label, so it never overflows its cell. */
const MAJOR_LABEL_RESERVE_PX = 96;

interface TimeRulerProps {
  viewport: Viewport;
}

/** Keeps the major label visible while its cell is partially scrolled out on the left. */
function getStickyOffset(tick: Tick): number {
  const width = tick.endX - tick.x;
  return Math.max(0, Math.min(-tick.x, width - MAJOR_LABEL_RESERVE_PX));
}

/** Two-level ruler: major units on top (e.g. "Março 2026"), minor units below (e.g. weeks). */
export const TimeRuler = memo(function TimeRuler({ viewport }: TimeRulerProps) {
  const { major, minor } = getGranularity(viewport.pxPerDay);
  const majorTicks = useMemo(
    () => generateTicks(viewport, major, { role: 'major' }),
    [viewport, major],
  );
  const minorTicks = useMemo(
    () => generateTicks(viewport, minor, { role: 'minor' }),
    [viewport, minor],
  );

  return (
    <div aria-hidden="true" className="relative h-full overflow-clip select-none">
      <div
        className="relative border-b border-timeline-grid"
        style={{ height: TIMELINE_METRICS.rulerMajorHeight }}
      >
        {majorTicks.map((tick) => (
          <div
            key={tick.day}
            className="absolute inset-y-0 border-l border-border"
            style={{ left: tick.x, width: tick.endX - tick.x }}
          >
            <span
              className="absolute top-1/2 left-2 text-xs font-medium whitespace-nowrap text-foreground"
              style={{ transform: `translate(${String(getStickyOffset(tick))}px, -50%)` }}
            >
              {tick.label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="relative"
        style={{ height: TIMELINE_METRICS.rulerHeight - TIMELINE_METRICS.rulerMajorHeight }}
      >
        {minorTicks.map((tick) => (
          <div
            key={tick.day}
            className="absolute inset-y-0 overflow-hidden border-l border-timeline-grid"
            style={{ left: tick.x, width: tick.endX - tick.x }}
          >
            <span className="absolute top-1/2 left-1.5 -translate-y-1/2 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
              {tick.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

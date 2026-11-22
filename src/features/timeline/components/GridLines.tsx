import { memo, useMemo } from 'react';

import type { Viewport } from '@/types/timeline';

import { generateTicks, getGranularity } from '../lib/ticks';

interface GridLinesProps {
  viewport: Viewport;
}

/** Vertical lines behind the bars: subtle for minor units, stronger for major units. */
export const GridLines = memo(function GridLines({ viewport }: GridLinesProps) {
  const { major, minor } = getGranularity(viewport.pxPerDay);
  const majorTicks = useMemo(
    () => generateTicks(viewport, major, { role: 'major' }),
    [viewport, major],
  );
  const minorTicks = useMemo(
    () => generateTicks(viewport, minor, { role: 'minor' }),
    [viewport, minor],
  );
  const majorDays = new Set(majorTicks.map((tick) => tick.day));

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {minorTicks
        .filter((tick) => !majorDays.has(tick.day))
        .map((tick) => (
          <div
            key={`minor-${String(tick.day)}`}
            className="absolute inset-y-0 w-px bg-timeline-grid"
            style={{ left: tick.x }}
          />
        ))}
      {majorTicks.map((tick) => (
        <div
          key={`major-${String(tick.day)}`}
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: tick.x }}
        />
      ))}
    </div>
  );
});

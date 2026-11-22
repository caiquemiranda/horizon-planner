import { memo, useMemo } from 'react';

import type { DayNumber, Viewport } from '@/types/timeline';

import { generateTicks, getGranularity } from '../lib/ticks';
import { getWeekday } from '../lib/time';

interface GridLinesProps {
  viewport: Viewport;
}

function isWeekend(day: DayNumber): boolean {
  const weekday = getWeekday(day);
  return weekday === 0 || weekday === 6;
}

/**
 * Background of the canvas: subtle lines for minor units, stronger lines for major units,
 * and shaded weekends when the zoom shows individual days.
 */
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
  const showWeekends = minor === 'day';

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {showWeekends
        ? minorTicks
            .filter((tick) => isWeekend(tick.day))
            .map((tick) => (
              <div
                key={`weekend-${String(tick.day)}`}
                data-weekend=""
                className="absolute inset-y-0 bg-timeline-weekend"
                style={{ left: tick.x, width: tick.endX - tick.x }}
              />
            ))
        : null}
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

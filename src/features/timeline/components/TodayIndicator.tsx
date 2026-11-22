import { cn } from '@/lib/utils';
import type { DayNumber, Viewport } from '@/types/timeline';

import { dayToX } from '../lib/scale';

interface TodayIndicatorProps {
  viewport: Viewport;
  today: DayNumber;
  /** `ruler` adds the "Hoje" label; `canvas` draws only the line. */
  variant: 'ruler' | 'canvas';
}

/** Vertical marker at the current moment. Hidden while today is out of view. */
export function TodayIndicator({ viewport, today, variant }: TodayIndicatorProps) {
  const x = dayToX(today, viewport);
  if (viewport.widthPx <= 0 || x < 0 || x > viewport.widthPx) return null;

  return (
    <div
      data-testid={`today-${variant}`}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-10 w-0"
      style={{ left: x }}
    >
      <div
        className={cn(
          'absolute inset-y-0 -left-px w-0.5 bg-today',
          variant === 'canvas' && 'opacity-80',
        )}
      />
      {variant === 'ruler' ? (
        <span className="absolute bottom-1 left-0 -translate-x-1/2 rounded-sm bg-today px-1.5 py-px text-[10px] font-semibold tracking-wide text-white uppercase shadow-sm">
          Hoje
        </span>
      ) : null}
    </div>
  );
}

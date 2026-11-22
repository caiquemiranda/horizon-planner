import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react';

import { useElementWidth } from '@/features/timeline/hooks/useElementWidth';
import { cn } from '@/lib/utils';

/** Narrower than this, the panes are shown one at a time with a switch. */
export const SPLIT_BREAKPOINT_PX = 768;
const MIN_LEFT_PX = 240;
const MIN_RIGHT_PX = 240;
/** Table width while the chart is shown on a narrow screen: EAP and the start of names. */
const NARROW_LEFT_PX = 150;
const KEY_STEP_PX = 24;

interface SplitViewProps {
  left: ReactNode;
  right: ReactNode;
  /** Preferred width of the left pane (remembered per project). */
  leftWidth: number;
  onLeftWidthChange: (width: number) => void;
}

/**
 * Two panes side by side with a draggable divider (mouse, touch or keyboard arrows).
 * Resizing changes only the panes' widths: rows keep their heights and the chart keeps
 * its dates-to-pixels scale anchored on the left edge.
 *
 * On narrow screens a switch shows either the full table or the chart with a slim
 * table column, so both stay usable without overlapping.
 */
export function SplitView({ left, right, leftWidth, onLeftWidthChange }: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [narrowView, setNarrowView] = useState<'table' | 'chart'>('chart');
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useElementWidth(containerRef, setContainerWidth);

  const isNarrow = containerWidth > 0 && containerWidth < SPLIT_BREAKPOINT_PX;
  const maxLeft = Math.max(MIN_LEFT_PX, containerWidth - MIN_RIGHT_PX);
  const clamp = (width: number) => Math.round(Math.min(maxLeft, Math.max(MIN_LEFT_PX, width)));
  // Before the first measurement there is nothing to clamp against: use the preference,
  // so the chart never gets a temporary width (and a wrong initial fit).
  const width = isNarrow
    ? narrowView === 'table'
      ? containerWidth
      : NARROW_LEFT_PX
    : containerWidth === 0
      ? leftWidth
      : clamp(leftWidth);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_PX * 4 : KEY_STEP_PX;
    const next: Partial<Record<string, number>> = {
      ArrowLeft: width - step,
      ArrowRight: width + step,
      Home: MIN_LEFT_PX,
      End: maxLeft,
    };
    const target = next[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onLeftWidthChange(clamp(target));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onLeftWidthChange(clamp(drag.current.startWidth + event.clientX - drag.current.startX));
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isNarrow ? (
        <div
          role="group"
          aria-label="Visualização"
          className="flex shrink-0 gap-1 border-b bg-background p-1.5"
        >
          {(['chart', 'table'] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={narrowView === view}
              onClick={() => {
                setNarrowView(view);
              }}
              className={cn(
                'flex-1 rounded-md px-3 py-1 text-sm text-muted-foreground',
                narrowView === view && 'bg-accent font-medium text-foreground',
              )}
            >
              {view === 'chart' ? 'Gantt' : 'Tabela'}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={containerRef} className="flex min-h-0 flex-1">
        <div className="flex min-w-0 shrink-0 flex-col border-r bg-background" style={{ width }}>
          {left}
        </div>
        {!isNarrow ? (
          // A focusable separator is the WAI-ARIA "window splitter" widget, which the lint
          // rule does not know about.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <div
            role="separator"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Redimensionar tabela e gráfico"
            aria-valuemin={MIN_LEFT_PX}
            aria-valuemax={maxLeft}
            aria-valuenow={width}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:w-0.5 group-hover:bg-ring group-focus-visible:w-0.5 group-focus-visible:bg-ring" />
          </div>
        ) : null}
        <div className={cn('flex min-w-0 flex-1', isNarrow && narrowView === 'table' && 'hidden')}>
          {right}
        </div>
      </div>
    </div>
  );
}

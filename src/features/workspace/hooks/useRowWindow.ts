import { type RefObject, useEffect, useReducer, useRef } from 'react';

/**
 * Row virtualization shared by the table and the chart: both render only the rows
 * around what is visible in the table's scroll container (plus an overscan margin), so
 * hundreds or thousands of tasks keep scrolling smoothly.
 *
 * The window is computed during render from the container's current scroll position;
 * scroll and resize events only trigger that render. Code that moves the scroll position
 * synchronously (e.g. keyboard navigation) is therefore always rendered in the same pass.
 *
 * Without layout (jsdom, or before the container is measured) every row is rendered.
 */

/** Rows the window moves by. */
export const WINDOW_BLOCK = 8;

export interface RowWindow {
  first: number;
  last: number;
  /** False when every row is rendered. */
  virtualized: boolean;
}

export interface RowWindowOptions {
  rowHeight: number;
  /** Space above the first row inside the scroll container (the sticky table header). */
  offsetTop?: number;
  overscan?: number;
}

export function getRowWindow(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  { rowHeight, offsetTop = 0, overscan = 12 }: RowWindowOptions,
): RowWindow {
  if (viewportHeight <= 0 || rowCount === 0) {
    return { first: 0, last: rowCount - 1, virtualized: false };
  }
  const top = Math.max(0, scrollTop - offsetTop);
  // The window moves in blocks of rows, so most scroll frames render nothing new.
  const firstVisible = Math.floor(top / rowHeight);
  const lastVisible = Math.ceil((top + viewportHeight) / rowHeight);
  const first = Math.max(0, Math.floor(firstVisible / WINDOW_BLOCK) * WINDOW_BLOCK - overscan);
  const last = Math.min(
    rowCount - 1,
    Math.ceil(lastVisible / WINDOW_BLOCK) * WINDOW_BLOCK + overscan,
  );
  return { first, last, virtualized: first > 0 || last < rowCount - 1 };
}

/** Re-renders on scroll (once per frame) and resize of the scroll container. */
export function useRowWindow(
  scrollerRef: RefObject<HTMLElement | null>,
  rowCount: number,
  options: RowWindowOptions,
): RowWindow {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const latest = useRef({ rowCount, options, window: null as RowWindow | null });
  latest.current.rowCount = rowCount;
  latest.current.options = options;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Most scroll frames stay inside the overscan: skip those renders.
        const next = getRowWindow(
          scroller.scrollTop,
          scroller.clientHeight,
          latest.current.rowCount,
          latest.current.options,
        );
        const previous = latest.current.window;
        if (previous?.first === next.first && previous.last === next.last) return;
        rerender();
      });
    };
    scroller.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    schedule();
    return () => {
      scroller.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollerRef]);

  const scroller = scrollerRef.current;
  const current = getRowWindow(
    scroller?.scrollTop ?? 0,
    scroller?.clientHeight ?? 0,
    rowCount,
    options,
  );
  latest.current.window = current;
  return current;
}

/** Scrolls the container just enough to show row `index` below the sticky header. */
export function ensureRowVisible(
  scroller: HTMLElement | null,
  index: number,
  rowHeight: number,
  offsetTop = 0,
): void {
  if (!scroller || scroller.clientHeight <= 0) return;
  const top = offsetTop + index * rowHeight;
  const visibleTop = scroller.scrollTop + offsetTop;
  const visibleBottom = scroller.scrollTop + scroller.clientHeight;
  if (top < visibleTop) scroller.scrollTop = top - offsetTop;
  else if (top + rowHeight > visibleBottom)
    scroller.scrollTop = top + rowHeight - scroller.clientHeight;
}

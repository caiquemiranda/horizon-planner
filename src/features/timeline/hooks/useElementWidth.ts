import { type RefObject, useLayoutEffect } from 'react';

/**
 * Calls `onWidth` with the element's content width on mount and whenever it resizes.
 * `onWidth` must be stable (e.g. a store action).
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
  onWidth: (width: number) => void,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    onWidth(element.clientWidth);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) onWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref, onWidth]);
}

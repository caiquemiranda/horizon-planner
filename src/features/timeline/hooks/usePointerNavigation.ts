import { type RefObject, useEffect } from 'react';

import { getPinchChange, hasExceededDragThreshold, type Point } from '../lib/gestures';
import { useViewportStoreApi } from '../store/viewportContext';

/**
 * Drag to pan (mouse, pen or one finger) and two-finger pinch to zoom on the canvas.
 *
 * - Horizontal movement pans through time; with a mouse, vertical movement also scrolls
 *   the lanes (touch keeps the native vertical scroll via `touch-action: pan-y`).
 * - A press that moves less than the drag threshold stays a normal click, so bars remain
 *   clickable; after a real drag the click that follows is swallowed.
 * - `data-panning` is set on the canvas while dragging, for the grabbing cursor.
 * - Elements marked `data-no-pan` (e.g. link handles) own their gestures: pressing on
 *   them never starts a pan. This listener is native, so it runs before React handlers
 *   and cannot rely on their `stopPropagation`.
 */
export function usePointerNavigation(
  canvasRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
) {
  const store = useViewportStoreApi();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const element: HTMLElement = canvas;

    const pointers = new Map<number, Point>();
    let dragStart: Point | null = null;
    let isDragging = false;

    function toLocal(event: PointerEvent): Point {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function getPair(source: ReadonlyMap<number, Point>): [Point, Point] | null {
      const [first, second] = [...source.values()];
      return first && second ? [first, second] : null;
    }

    function swallowNextClick() {
      const swallow = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
      };
      element.addEventListener('click', swallow, { capture: true, once: true });
      // If no click follows (e.g. released outside), drop the listener on the next frame.
      requestAnimationFrame(() => {
        element.removeEventListener('click', swallow, { capture: true });
      });
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('[data-no-pan]')) return;

      pointers.set(event.pointerId, toLocal(event));
      if (pointers.size === 1) {
        dragStart = toLocal(event);
        isDragging = false;
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const previousPoint = pointers.get(event.pointerId);
      if (!previousPoint) return;

      const point = toLocal(event);
      const { panBy, zoomAt } = store.getState();

      if (pointers.size >= 2) {
        const previousPair = getPair(pointers);
        pointers.set(event.pointerId, point);
        const nextPair = getPair(pointers);
        if (!previousPair || !nextPair) return;

        const { anchorX, factor, panDeltaPx } = getPinchChange(previousPair, nextPair);
        zoomAt(anchorX, factor);
        panBy(panDeltaPx);
        isDragging = true;
        return;
      }

      pointers.set(event.pointerId, point);

      if (!isDragging) {
        if (!dragStart || !hasExceededDragThreshold(dragStart, point)) return;
        isDragging = true;
        element.setPointerCapture(event.pointerId);
        element.dataset.panning = '';
      }

      panBy(previousPoint.x - point.x);
      if (event.pointerType === 'mouse' && scrollRef.current) {
        scrollRef.current.scrollTop += previousPoint.y - point.y;
      }
    }

    function handlePointerEnd(event: PointerEvent) {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size > 0) return;

      if (isDragging) swallowNextClick();
      isDragging = false;
      dragStart = null;
      delete element.dataset.panning;
    }

    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', handlePointerEnd);
    element.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerEnd);
      element.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [canvasRef, scrollRef, store]);
}

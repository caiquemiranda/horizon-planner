import { type RefObject, useEffect } from 'react';

import { interpretWheel } from '../lib/gestures';
import { useViewportStore } from '../store/viewportStore';

/** Smallest |deltaY| treated as a mouse-wheel notch rather than a trackpad stream. */
const WHEEL_NOTCH_MIN_DELTA = 40;

/**
 * Wheel and trackpad navigation over the whole timeline (ruler and body).
 * The listener is not passive so zoom and horizontal pan can cancel the browser defaults
 * (page zoom, back/forward swipe); plain vertical scrolling is left untouched.
 */
export function useWheelNavigation(
  targetRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    function handleWheel(event: WheelEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const intent = interpretWheel(
        {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          offsetX: event.clientX - rect.left,
        },
        rect.width,
      );
      if (!intent) return;

      event.preventDefault();
      const { zoomAt, panBy } = useViewportStore.getState();

      if (intent.type === 'zoom') {
        // Mouse wheels jump in big notches: animate them. Trackpads already send a smooth stream.
        zoomAt(intent.anchorX, intent.factor, {
          smooth: Math.abs(intent.deltaY) >= WHEEL_NOTCH_MIN_DELTA,
        });
      } else panBy(intent.deltaPx);
    }

    target.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      target.removeEventListener('wheel', handleWheel);
    };
  }, [targetRef, canvasRef]);
}

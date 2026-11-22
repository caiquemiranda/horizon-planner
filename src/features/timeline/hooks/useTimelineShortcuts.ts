import { useEffect, useRef } from 'react';

import { isEditableTarget } from '@/lib/keyboard';

import { resolveShortcut } from '../lib/shortcuts';
import { ZOOM_PRESETS } from '../lib/ticks';
import { ZOOM_STEP_FACTOR } from '../lib/zoom';
import { useViewportStoreApi } from '../store/viewportContext';

interface UseTimelineShortcutsOptions {
  /** Range used by "fit" (`F`), e.g. every visible project or the whole schedule. */
  getFitRange: () => { start: number; end: number } | null;
  onShowHelp?: () => void;
}

/** Global keyboard shortcuts for the timeline (ignored while typing in a field). */
export function useTimelineShortcuts({ getFitRange, onShowHelp }: UseTimelineShortcutsOptions) {
  const viewportStore = useViewportStoreApi();
  // Latest values without re-subscribing the listener on every render.
  const latest = useRef({ getFitRange, onShowHelp });
  latest.current = { getFitRange, onShowHelp };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;

      const action = resolveShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isEditing: isEditableTarget(event.target),
      });
      if (!action) return;
      if (action.type === 'help' && !latest.current.onShowHelp) return;

      event.preventDefault();
      const store = viewportStore.getState();

      switch (action.type) {
        case 'zoom-in':
          store.zoomBy(ZOOM_STEP_FACTOR);
          break;
        case 'zoom-out':
          store.zoomBy(1 / ZOOM_STEP_FACTOR);
          break;
        case 'pan':
          store.panBy(store.viewport.widthPx * action.widthFraction, { smooth: true });
          break;
        case 'today':
          store.goToToday();
          break;
        case 'fit': {
          const extent = latest.current.getFitRange();
          if (extent) store.fitRange(extent.start, extent.end);
          break;
        }
        case 'preset': {
          const preset = ZOOM_PRESETS.find((option) => option.id === action.presetId);
          if (preset) store.zoomTo(preset.pxPerDay);
          break;
        }
        case 'help':
          latest.current.onShowHelp?.();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewportStore]);
}

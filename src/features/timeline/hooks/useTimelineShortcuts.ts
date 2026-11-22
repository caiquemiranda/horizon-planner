import { useEffect, useRef } from 'react';

import type { Project } from '@/types/project';

import { getProjectsExtent } from '../lib/layout';
import { isEditableTarget, resolveShortcut } from '../lib/shortcuts';
import { ZOOM_PRESETS } from '../lib/ticks';
import { ZOOM_STEP_FACTOR } from '../lib/zoom';
import { useViewportStore } from '../store/viewportStore';

interface UseTimelineShortcutsOptions {
  projects: readonly Project[];
  onShowHelp: () => void;
}

/** Global keyboard shortcuts for the timeline (ignored while typing in a field). */
export function useTimelineShortcuts({ projects, onShowHelp }: UseTimelineShortcutsOptions) {
  // Latest values without re-subscribing the listener on every render.
  const latest = useRef({ projects, onShowHelp });
  latest.current = { projects, onShowHelp };

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

      event.preventDefault();
      const store = useViewportStore.getState();

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
          const extent = getProjectsExtent(latest.current.projects);
          if (extent) store.fitRange(extent.start, extent.end);
          break;
        }
        case 'preset': {
          const preset = ZOOM_PRESETS.find((option) => option.id === action.presetId);
          if (preset) store.zoomTo(preset.pxPerDay);
          break;
        }
        case 'help':
          latest.current.onShowHelp();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

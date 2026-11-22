import { useEffect } from 'react';

import { isEditableTarget } from '@/lib/keyboard';

import { useDrawerStore } from '../store/drawerStore';

/** `N` opens the "new project" form (ignored while typing in a field). */
export function useProjectShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (event.key !== 'n' && event.key !== 'N') return;

      event.preventDefault();
      useDrawerStore.getState().openCreate();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

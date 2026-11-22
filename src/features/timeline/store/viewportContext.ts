import { createContext, useContext } from 'react';

import { useViewportStore, type ViewportStore } from './viewportStore';

/**
 * Which viewport the timeline components and gestures act on. Defaults to the portfolio
 * timeline; a project Gantt provides its own store.
 */
export const ViewportStoreContext = createContext<ViewportStore>(useViewportStore);

export function useViewportStoreApi(): ViewportStore {
  return useContext(ViewportStoreContext);
}

import { LocateFixed } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Project } from '@/types/project';

import { useTimelineShortcuts } from '../hooks/useTimelineShortcuts';
import { formatVisibleRange } from '../lib/format';
import { getProjectsExtent } from '../lib/layout';
import { getVisibleRange } from '../lib/scale';
import { useViewportStoreApi } from '../store/viewportContext';
import { ShortcutsHelp } from './ShortcutsHelp';
import { ZoomControls } from './ZoomControls';

interface TimelineToolbarProps {
  projects: readonly Project[];
}

/** Timeline actions shown in the app header. */
export function TimelineToolbar({ projects }: TimelineToolbarProps) {
  const store = useViewportStoreApi();
  const goToToday = store((state) => state.goToToday);
  const rangeLabel = store((state) => {
    if (state.viewport.widthPx <= 0) return '';
    const { from, to } = getVisibleRange(state.viewport);
    return formatVisibleRange(from, to);
  });
  const [isHelpOpen, setHelpOpen] = useState(false);

  useTimelineShortcuts({
    getFitRange: () => getProjectsExtent(projects),
    onShowHelp: () => {
      setHelpOpen(true);
    },
  });

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={goToToday}>
            <LocateFixed />
            {/* Icon only on phones, still named for screen readers. */}
            <span className="sr-only sm:not-sr-only">Hoje</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Centralizar a linha do tempo em hoje{' '}
          <Kbd className="ml-1 border-background/20 bg-background/15 text-background shadow-none">
            T
          </Kbd>
        </TooltipContent>
      </Tooltip>

      <ZoomControls fitExtent={getProjectsExtent(projects)} />
      <ShortcutsHelp open={isHelpOpen} onOpenChange={setHelpOpen} />

      {rangeLabel ? (
        // Not a live region: it changes on every frame while panning.
        <span className="ml-1 hidden text-sm font-medium text-muted-foreground capitalize lg:inline">
          {rangeLabel}
        </span>
      ) : null}
    </div>
  );
}

import { LocateFixed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Project } from '@/types/project';

import { formatVisibleRange } from '../lib/format';
import { getVisibleRange } from '../lib/scale';
import { useViewportStore } from '../store/viewportStore';
import { ZoomControls } from './ZoomControls';

interface TimelineToolbarProps {
  projects: readonly Project[];
}

/** Timeline actions shown in the app header. */
export function TimelineToolbar({ projects }: TimelineToolbarProps) {
  const goToToday = useViewportStore((state) => state.goToToday);
  const rangeLabel = useViewportStore((state) => {
    if (state.viewport.widthPx <= 0) return '';
    const { from, to } = getVisibleRange(state.viewport);
    return formatVisibleRange(from, to);
  });

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={goToToday}>
            <LocateFixed />
            Hoje
          </Button>
        </TooltipTrigger>
        <TooltipContent>Centralizar a linha do tempo em hoje</TooltipContent>
      </Tooltip>

      <ZoomControls projects={projects} />

      {rangeLabel ? (
        // Not a live region: it changes on every frame while panning.
        <span className="ml-1 hidden text-sm font-medium text-muted-foreground capitalize lg:inline">
          {rangeLabel}
        </span>
      ) : null}
    </div>
  );
}

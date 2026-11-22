import { LocateFixed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { formatVisibleRange } from '../lib/format';
import { getVisibleRange } from '../lib/scale';
import { useViewportStore } from '../store/viewportStore';

/** Timeline actions shown in the app header. */
export function TimelineToolbar() {
  const goToToday = useViewportStore((state) => state.goToToday);
  const rangeLabel = useViewportStore((state) => {
    if (state.viewport.widthPx <= 0) return '';
    const { from, to } = getVisibleRange(state.viewport);
    return formatVisibleRange(from, to);
  });

  return (
    <div className="flex items-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={goToToday}>
            <LocateFixed />
            Hoje
          </Button>
        </TooltipTrigger>
        <TooltipContent>Centralizar a linha do tempo em hoje</TooltipContent>
      </Tooltip>

      {rangeLabel ? (
        <span
          aria-live="polite"
          className="hidden text-sm font-medium text-muted-foreground capitalize sm:inline"
        >
          {rangeLabel}
        </span>
      ) : null}
    </div>
  );
}

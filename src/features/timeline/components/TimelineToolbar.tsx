import { LocateFixed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useViewportStore } from '../store/viewportStore';

/** Timeline actions shown in the app header. */
export function TimelineToolbar() {
  const goToToday = useViewportStore((state) => state.goToToday);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={goToToday}>
          <LocateFixed />
          Hoje
        </Button>
      </TooltipTrigger>
      <TooltipContent>Centralizar a linha do tempo em hoje</TooltipContent>
    </Tooltip>
  );
}

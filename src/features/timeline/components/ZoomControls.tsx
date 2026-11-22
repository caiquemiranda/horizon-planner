import { ChevronDown, Maximize2, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ZOOM_PRESETS } from '../lib/ticks';
import { canZoomIn, canZoomOut, getNearestPreset, ZOOM_STEP_FACTOR } from '../lib/zoom';
import { useViewportStoreApi } from '../store/viewportContext';

function WithTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface ZoomControlsProps {
  /** Range shown by the "fit" button; disabled when `null`. */
  fitExtent: { start: number; end: number } | null;
  /** Accessible name of the "fit" button. */
  fitLabel?: string;
}

/** Zoom out / preset menu / zoom in, plus "fit" (all projects, or the whole schedule). */
export function ZoomControls({
  fitExtent: extent,
  fitLabel = 'Ajustar todos os projetos',
}: ZoomControlsProps) {
  const store = useViewportStoreApi();
  const pxPerDay = store((state) => state.viewport.pxPerDay);
  const zoomBy = store((state) => state.zoomBy);
  const zoomTo = store((state) => state.zoomTo);
  const fitRange = store((state) => state.fitRange);

  const currentPreset = getNearestPreset(pxPerDay);

  return (
    <div className="flex items-center gap-1">
      <div role="group" aria-label="Zoom" className="flex items-center rounded-md border shadow-xs">
        <WithTooltip label="Diminuir zoom">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Diminuir zoom"
            className="rounded-r-none"
            disabled={!canZoomOut(pxPerDay)}
            onClick={() => {
              zoomBy(1 / ZOOM_STEP_FACTOR);
            }}
          >
            <Minus />
          </Button>
        </WithTooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Nível de zoom: ${currentPreset.label}`}
              className="w-24 justify-between rounded-none border-x px-2.5 font-normal sm:w-30"
            >
              {currentPreset.label}
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-40">
            <DropdownMenuLabel className="text-label">Escala</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={currentPreset.id}
              onValueChange={(id) => {
                const preset = ZOOM_PRESETS.find((option) => option.id === id);
                if (preset) zoomTo(preset.pxPerDay);
              }}
            >
              {ZOOM_PRESETS.map((preset) => (
                <DropdownMenuRadioItem key={preset.id} value={preset.id}>
                  {preset.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <WithTooltip label="Aumentar zoom">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Aumentar zoom"
            className="rounded-l-none"
            disabled={!canZoomIn(pxPerDay)}
            onClick={() => {
              zoomBy(ZOOM_STEP_FACTOR);
            }}
          >
            <Plus />
          </Button>
        </WithTooltip>
      </div>

      <WithTooltip label={`${fitLabel} na tela`}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={fitLabel}
          disabled={!extent}
          onClick={() => {
            if (extent) fitRange(extent.start, extent.end);
          }}
        >
          <Maximize2 />
        </Button>
      </WithTooltip>
    </div>
  );
}

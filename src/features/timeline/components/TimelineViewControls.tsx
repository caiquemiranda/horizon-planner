import { Keyboard, LocateFixed } from 'lucide-react';
import { useId } from 'react';

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

interface TimelineViewControlsProps {
  /** Projects on screen, for "fit". */
  projects: readonly Project[];
  onShowShortcuts: () => void;
}

/**
 * The timeline's view controls, in the navigation sidebar: the visible period, "Hoje",
 * the zoom scale and "fit", and the shortcuts list.
 */
export function TimelineViewControls({ projects, onShowShortcuts }: TimelineViewControlsProps) {
  const store = useViewportStoreApi();
  const goToToday = store((state) => state.goToToday);
  const rangeLabel = store((state) => {
    if (state.viewport.widthPx <= 0) return '';
    const { from, to } = getVisibleRange(state.viewport);
    return formatVisibleRange(from, to);
  });
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5 px-2.5">
        <h2 id={headingId} className="text-label">
          Visualização
        </h2>
        {rangeLabel ? (
          // Not a live region: it changes on every frame while panning.
          <span className="text-xs text-muted-foreground capitalize">{rangeLabel}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-1 px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={goToToday}>
              <LocateFixed />
              Hoje
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Centralizar a linha do tempo em hoje{' '}
            <Kbd className="ml-1 border-background/20 bg-background/15 text-background shadow-none">
              T
            </Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground"
              aria-label="Atalhos de teclado"
              onClick={onShowShortcuts}
            >
              <Keyboard />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Atalhos de teclado{' '}
            <Kbd className="ml-1 border-background/20 bg-background/15 text-background shadow-none">
              ?
            </Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="px-1">
        <ZoomControls fitExtent={getProjectsExtent(projects)} />
      </div>
    </section>
  );
}

/** Collapsed rail: "Hoje" as an icon. */
export function TimelineRailControls() {
  const goToToday = useViewportStoreApi()((state) => state.goToToday);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label="Hoje"
          onClick={goToToday}
        >
          <LocateFixed />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">Centralizar a linha do tempo em hoje</TooltipContent>
    </Tooltip>
  );
}

interface TimelineShortcutsProps {
  projects: readonly Project[];
  helpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  /** `false` while a dialog over the page owns the keyboard. */
  enabled?: boolean;
}

/**
 * The timeline's keyboard shortcuts and their help, mounted with the page so they work
 * whether the sidebar is expanded, collapsed or (on phones) closed.
 */
export function TimelineShortcuts({
  projects,
  helpOpen,
  onHelpOpenChange,
  enabled = true,
}: TimelineShortcutsProps) {
  useTimelineShortcuts({
    getFitRange: () => getProjectsExtent(projects),
    enabled,
    onShowHelp: () => {
      onHelpOpenChange(true);
    },
  });
  return <ShortcutsHelp open={helpOpen} onOpenChange={onHelpOpenChange} />;
}

import {
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  EyeOff,
  LayoutList,
  type LucideIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  X,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useId, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SECTION_HREFS } from '@/lib/router';
import { cn } from '@/lib/utils';

import { countSections, type ProjectSection } from '../lib/sections';
import { useProjectsStore } from '../store/projectsStore';
import { useSidebarStore } from '../store/sidebarStore';

interface SectionMeta {
  label: string;
  icon: LucideIcon;
}

export const SECTION_META = {
  all: { label: 'Todos os projetos', icon: LayoutList },
  active: { label: 'Ativos', icon: CirclePlay },
  postponed: { label: 'Adiados', icon: CirclePause },
  not_completed: { label: 'Não concluídos', icon: CircleX },
  completed: { label: 'Concluídos', icon: CircleCheck },
  hidden: { label: 'Ocultos', icon: EyeOff },
  trash: { label: 'Lixeira', icon: Trash2 },
} as const satisfies Record<ProjectSection, SectionMeta>;

/** Visible-project sections first, then the places projects are kept out of the lists. */
const GROUPS: readonly (readonly ProjectSection[])[] = [
  ['all', 'active', 'postponed', 'not_completed', 'completed'],
  ['hidden', 'trash'],
];

function pluralize(count: number) {
  return count === 1 ? '1 projeto' : `${String(count)} projetos`;
}

interface SectionNavProps {
  current: ProjectSection;
  collapsed: boolean;
  /** Called after following a link, e.g. to close the phone drawer. */
  onNavigate?: () => void;
}

/** The section links; the same list for the rail and the phone drawer. */
function SectionNav({ current, collapsed, onNavigate }: SectionNavProps) {
  const projects = useProjectsStore((state) => state.projects);
  const counts = useMemo(() => countSections(projects), [projects]);

  return (
    <nav aria-label="Seções" className="flex flex-col gap-3 p-2">
      {GROUPS.map((group, index) => (
        <ul key={index} className={cn('flex flex-col gap-0.5', index > 0 && 'border-t pt-3')}>
          {group.map((section) => {
            const { label, icon: Icon } = SECTION_META[section];
            const active = section === current;
            const link = (
              <a
                href={SECTION_HREFS[section]}
                // Starts with the visible label, so voice control finds it by what is shown.
                aria-label={`${label}, ${pluralize(counts[section])}`}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                  // The active item has a bar and bold text, not only a color.
                  active &&
                    'bg-accent font-semibold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
                  collapsed && 'justify-center px-0',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>{label}</span>
                {collapsed ? null : (
                  <span className="font-mono text-[11px] text-subtle-foreground tabular-nums">
                    {counts[section]}
                  </span>
                )}
              </a>
            );
            return (
              <li key={section}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">
                      {label} · {counts[section]}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

/**
 * Collapsible navigation rail beside the page, from the `md` breakpoint up. Collapsing
 * really narrows it, so the content gets the width; the choice is remembered.
 */
export function NavigationRail({ current }: { current: ProjectSection }) {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggle = useSidebarStore((state) => state.toggleCollapsed);
  const regionId = useId();

  return (
    <aside
      aria-label="Navegação"
      className={cn(
        'hidden shrink-0 flex-col border-r bg-background motion-safe:transition-[width] motion-safe:duration-200 md:flex',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div id={regionId} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <SectionNav current={current} collapsed={collapsed} />
      </div>
      <div className={cn('border-t p-2', collapsed && 'flex justify-center')}>
        <Button
          variant="ghost"
          size={collapsed ? 'icon-sm' : 'sm'}
          className={cn('text-muted-foreground', !collapsed && 'w-full justify-start')}
          aria-expanded={!collapsed}
          aria-controls={regionId}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          onClick={toggle}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {collapsed ? null : 'Recolher'}
        </Button>
      </div>
    </aside>
  );
}

/** Phone and small tablet: a menu button opening the sections in a drawer. */
export function NavigationDrawerButton({ current }: { current: ProjectSection }) {
  const open = useSidebarStore((state) => state.mobileOpen);
  const setOpen = useSidebarStore((state) => state.setMobileOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Abrir menu">
          <Menu />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-background shadow-popover outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
          <div className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4">
            <Dialog.Title className="flex-1 text-sm font-semibold">Seções</Dialog.Title>
            <Dialog.Description className="sr-only">
              Navegue entre os projetos ativos, concluídos, ocultos e a lixeira.
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar menu">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SectionNav
              current={current}
              collapsed={false}
              onNavigate={() => {
                setOpen(false);
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

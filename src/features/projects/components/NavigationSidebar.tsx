import {
  ChevronRight,
  CircleCheck,
  CirclePause,
  CirclePlay,
  CircleX,
  EyeOff,
  FlaskConical,
  LayoutDashboard,
  LayoutList,
  type LucideIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DASHBOARD_HREF, projectHref, SECTION_HREFS } from '@/lib/router';
import { cn } from '@/lib/utils';
import type { Horizon, Project, UUID } from '@/types/project';

import { COLOR_META, HORIZON_META } from '../constants';
import {
  countSections,
  getHomeSection,
  groupByHorizon,
  type ProjectSection,
  searchProjects,
  selectSection,
} from '../lib/sections';
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
  examples: { label: 'Exemplos', icon: FlaskConical },
} as const satisfies Record<ProjectSection, SectionMeta>;

/**
 * Visible-project sections first, then the places projects are kept out of the lists,
 * then the sample projects, apart from the user's own.
 */
const GROUPS: readonly (readonly ProjectSection[])[] = [
  ['all', 'active', 'postponed', 'not_completed', 'completed'],
  ['hidden', 'trash'],
  ['examples'],
];

function pluralize(count: number) {
  return count === 1 ? '1 projeto' : `${String(count)} projetos`;
}

/** What the navigation marks as current: a section or "Meu painel". */
export type NavigationTarget = ProjectSection | 'dashboard';

interface SectionNavProps {
  /** `null` on a project's own page: only the project is marked. */
  current: NavigationTarget | null;
  collapsed: boolean;
  /** The project open in the workspace, marked in its list. */
  currentProjectId?: UUID | null | undefined;
  /** Called after following a link, e.g. to close the phone drawer. */
  onNavigate?: (() => void) | undefined;
  /** The page's own controls (view, filters), under the search. */
  tools?: PageTools | undefined;
}

/**
 * Controls a page adds to the sidebar: `expanded` under the search, `collapsed` as icons
 * in the narrow rail. The portfolio puts its view and filters here, so the sidebar holds
 * every way of choosing what the timeline shows.
 */
export interface PageTools {
  expanded: ReactNode;
  collapsed?: ReactNode;
}

/** Projects shown under an opened section before "Ver todos". */
const LIST_LIMIT = 50;
/** Search results shown at once. */
const SEARCH_LIMIT = 30;

const linkClass = (active: boolean, collapsed: boolean) =>
  cn(
    'relative flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
    // The active item has a bar and bold text, not only a color.
    active &&
      'bg-accent font-semibold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
    collapsed && 'justify-center px-0',
  );

/**
 * The project explorer; the same for the rail and the phone drawer. Sections lead to
 * their pages and, expanded, list their projects; the search finds any project, hidden
 * and trashed ones included, by its title.
 */
function SectionNav({
  current,
  collapsed,
  currentProjectId = null,
  onNavigate,
  tools,
}: SectionNavProps) {
  const projects = useProjectsStore((state) => state.projects);
  const counts = useMemo(() => countSections(projects), [projects]);
  const currentProject = currentProjectId
    ? projects.find((project) => project.id === currentProjectId)
    : undefined;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<ProjectSection>>(() => {
    if (currentProject) return new Set([getHomeSection(currentProject)]);
    return new Set(
      current === null || current === 'dashboard' || current === 'all' ? [] : [current],
    );
  });
  // Open the current project's section once it is known (projects may still be loading).
  const homeSection = currentProject ? getHomeSection(currentProject) : null;
  useEffect(() => {
    if (!homeSection) return;
    setOpen((previous) =>
      previous.has(homeSection) ? previous : new Set([...previous, homeSection]),
    );
  }, [homeSection, currentProjectId]);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchRequest = useSidebarStore((state) => state.searchRequest);
  const searchId = useId();

  // "Buscar projeto" from the collapsed rail expands it and lands in the search field.
  useEffect(() => {
    if (searchRequest > 0) searchRef.current?.focus();
  }, [searchRequest]);

  const results = useMemo(() => searchProjects(projects, query), [projects, query]);
  const searching = query.trim() !== '';

  const toggle = (section: ProjectSection) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <nav aria-label="Seções" className="flex flex-col gap-3 p-2">
      <DashboardLink current={current} collapsed={collapsed} onNavigate={onNavigate} />

      {collapsed ? (
        <CollapsedTools currentProject={currentProject} extra={tools?.collapsed} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={searchId} className="sr-only">
            Buscar projeto
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              placeholder="Buscar projeto"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query !== '') {
                  event.stopPropagation();
                  setQuery('');
                }
              }}
              className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
          <p
            role="status"
            className={cn('px-1 text-xs text-muted-foreground', !searching && 'sr-only')}
          >
            {searching
              ? results.length === 0
                ? 'Nenhum projeto encontrado'
                : results.length === 1
                  ? '1 projeto encontrado'
                  : `${String(results.length)} projetos encontrados`
              : ''}
          </p>
        </div>
      )}

      {tools && !collapsed && !searching ? (
        <div className="flex flex-col gap-3 border-b pb-3">{tools.expanded}</div>
      ) : null}

      {searching && !collapsed ? (
        <ul aria-label="Resultados da busca" className="flex flex-col gap-0.5">
          {results.slice(0, SEARCH_LIMIT).map((project) => (
            <li key={project.id}>
              <ProjectLink
                project={project}
                current={project.id === currentProjectId}
                where={SECTION_META[getHomeSection(project)].label}
                onNavigate={onNavigate}
              />
            </li>
          ))}
          {results.length > SEARCH_LIMIT ? (
            <li className="px-2.5 py-1 text-xs text-muted-foreground">
              Refine a busca para ver os outros {results.length - SEARCH_LIMIT}.
            </li>
          ) : null}
        </ul>
      ) : (
        GROUPS.map((group, index) => (
          <ul key={index} className={cn('flex flex-col gap-0.5', index > 0 && 'border-t pt-3')}>
            {group.map((section) => {
              const { label, icon: Icon } = SECTION_META[section];
              const active = section === current;
              // "Todos" would repeat every list; its page shows them all.
              const listable = !collapsed && section !== 'all' && counts[section] > 0;
              const expanded = listable && open.has(section);
              const listId = `${searchId}-${section}`;
              const link = (
                <a
                  href={SECTION_HREFS[section]}
                  // Starts with the visible label, so voice control finds it by what is shown.
                  aria-label={`${label}, ${pluralize(counts[section])}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={linkClass(active, collapsed)}
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
                    <div className="flex items-center gap-0.5">
                      {link}
                      {listable ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0 text-muted-foreground"
                          aria-expanded={expanded}
                          aria-controls={listId}
                          aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} projetos de ${label}`}
                          onClick={() => {
                            toggle(section);
                          }}
                        >
                          <ChevronRight
                            className={cn(
                              'motion-safe:transition-transform',
                              expanded && 'rotate-90',
                            )}
                          />
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {expanded ? (
                    <SectionProjects
                      id={listId}
                      section={section}
                      label={label}
                      projects={projects}
                      currentProjectId={currentProjectId}
                      onNavigate={onNavigate}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ))
      )}
    </nav>
  );
}

/**
 * The projects of an opened section, split into the portfolio horizons (short, medium and
 * long term) as subcategories that can be folded. At most `LIST_LIMIT` projects are shown;
 * the section page lists the rest.
 */
function SectionProjects({
  id,
  section,
  label,
  projects,
  currentProjectId,
  onNavigate,
}: {
  id: string;
  section: ProjectSection;
  label: string;
  projects: readonly Project[];
  currentProjectId: UUID | null;
  onNavigate?: (() => void) | undefined;
}) {
  const listed = useMemo(() => selectSection(projects, section), [projects, section]);
  const groups = useMemo(() => groupByHorizon(listed), [listed]);
  const [folded, setFolded] = useState<ReadonlySet<Horizon>>(new Set());
  let budget = LIST_LIMIT;

  return (
    <ul
      id={id}
      aria-label={`Projetos de ${label}`}
      className="mt-0.5 ml-4 flex flex-col gap-1 border-l pl-1.5"
    >
      {groups.map(({ horizon, projects: group }) => {
        const meta = HORIZON_META[horizon];
        const open = !folded.has(horizon);
        const shown = open ? group.slice(0, Math.max(0, budget)) : [];
        budget -= shown.length;
        const groupId = `${id}-${horizon}`;
        return (
          <li key={horizon}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={groupId}
              onClick={() => {
                setFolded((previous) => {
                  const next = new Set(previous);
                  if (next.has(horizon)) next.delete(horizon);
                  else next.add(horizon);
                  return next;
                });
              }}
              className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn('size-3 motion-safe:transition-transform', open && 'rotate-90')}
              />
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(${meta.cssVar})` }}
              />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              <span className="font-mono text-[10px] text-subtle-foreground tabular-nums">
                {group.length}
              </span>
            </button>
            {open ? (
              <ul id={groupId} aria-label={meta.label} className="flex flex-col gap-0.5">
                {shown.map((project) => (
                  <li key={project.id}>
                    <ProjectLink
                      project={project}
                      current={project.id === currentProjectId}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
      {listed.length > LIST_LIMIT ? (
        <li>
          <a
            href={SECTION_HREFS[section]}
            onClick={onNavigate}
            className="block px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Ver todos os {listed.length}
          </a>
        </li>
      ) : null}
    </ul>
  );
}

/** A project in the explorer: opens its workspace. The full title is in the tooltip. */
function ProjectLink({
  project,
  current,
  where,
  onNavigate,
}: {
  project: Project;
  current: boolean;
  /** Section it belongs to, shown in search results. */
  where?: string;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <a
      href={projectHref(project.id)}
      title={project.title}
      aria-current={current ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
        current && 'bg-accent font-semibold text-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', COLOR_META[project.color].swatchClassName)}
      />
      <span className="min-w-0 flex-1 truncate">{project.title}</span>
      {where ? <span className="shrink-0 text-[11px] text-subtle-foreground">{where}</span> : null}
    </a>
  );
}

/** Collapsed rail: the current project and a way to search, without staying stuck in it. */
function CollapsedTools({
  currentProject,
  extra,
}: {
  currentProject: Project | undefined;
  extra?: ReactNode;
}) {
  const requestSearch = useSidebarStore((state) => state.requestSearch);
  return (
    <div className="flex flex-col items-center gap-1 border-b pb-3">
      {currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={projectHref(currentProject.id)}
              aria-current="page"
              aria-label={`Projeto atual: ${currentProject.title}`}
              className="flex size-9 items-center justify-center rounded-md bg-accent outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2.5 rounded-full',
                  COLOR_META[currentProject.color].swatchClassName,
                )}
              />
            </a>
          </TooltipTrigger>
          <TooltipContent side="right">{currentProject.title}</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Buscar projeto"
            onClick={requestSearch}
          >
            <Search />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Buscar projeto</TooltipContent>
      </Tooltip>
      {extra}
    </div>
  );
}

/** "Meu painel": the statistics page, above the sections. */
function DashboardLink({ current, collapsed, onNavigate }: SectionNavProps) {
  const active = current === 'dashboard';
  const link = (
    <a
      href={DASHBOARD_HREF}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
        active &&
          'bg-accent font-semibold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
        collapsed && 'justify-center px-0',
      )}
    >
      <LayoutDashboard aria-hidden="true" className="size-4 shrink-0" />
      <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>Meu painel</span>
    </a>
  );
  return (
    <div className="border-b pb-3">
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">Meu painel</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </div>
  );
}

/**
 * Collapsible navigation rail beside the page, from the `md` breakpoint up. Collapsing
 * really narrows it, so the content gets the width; the choice is remembered.
 */
interface NavigationProps {
  current: NavigationTarget | null;
  /** The project open in the workspace, if any. */
  currentProjectId?: UUID | null;
  /** The page's own controls (see `PageTools`). */
  tools?: PageTools;
}

export function NavigationRail({ current, currentProjectId = null, tools }: NavigationProps) {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggle = useSidebarStore((state) => state.toggleCollapsed);
  const regionId = useId();

  return (
    <aside
      aria-label="Navegação"
      className={cn(
        'hidden shrink-0 flex-col border-r bg-background motion-safe:transition-[width] motion-safe:duration-200 md:flex',
        collapsed ? 'w-14' : 'w-64',
      )}
    >
      <div id={regionId} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <SectionNav
          current={current}
          collapsed={collapsed}
          currentProjectId={currentProjectId}
          tools={tools}
        />
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
export function NavigationDrawerButton({
  current,
  currentProjectId = null,
  tools,
}: NavigationProps) {
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
              currentProjectId={currentProjectId}
              tools={tools}
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

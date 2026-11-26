import { EyeOff, FlaskConical, Inbox, Plus, SearchX } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { DataMenu } from '@/features/data-io/components/DataMenu';
import { FilterPanel, FilterRailButton } from '@/features/filters/components/FilterPanel';
import { useFilteredProjects } from '@/features/filters/hooks/useFilteredProjects';
import { useFiltersStore } from '@/features/filters/store/filtersStore';
import {
  NavigationDrawerButton,
  NavigationRail,
  type PageTools,
  SECTION_META,
} from '@/features/projects/components/NavigationSidebar';
import { NewProjectButton } from '@/features/projects/components/NewProjectButton';
import { ProjectPanel } from '@/features/projects/components/ProjectPanel';
import { isInSection, type TimelineSection } from '@/features/projects/lib/sections';
import { selectOwnProjects } from '@/features/projects/lib/visibility';
import { selectEditingProjectId, useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { Timeline } from '@/features/timeline/components/Timeline';
import { TimelineEmptyState } from '@/features/timeline/components/TimelineEmptyState';
import {
  TimelineRailControls,
  TimelineShortcuts,
  TimelineViewControls,
} from '@/features/timeline/components/TimelineViewControls';
import { isRangeVisible } from '@/features/timeline/lib/layout';
import { isoRangeToDays } from '@/features/timeline/lib/time';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { EXAMPLES_HREF, HIDDEN_HREF, PORTFOLIO_HREF, TRASH_HREF } from '@/lib/router';
import type { Project } from '@/types/project';

interface PortfolioPageProps {
  /** Which visible projects to draw (see `features/projects/lib/sections.ts`). */
  section: TimelineSection;
}

/** The portfolio: the projects of one section on the strategic timeline. */
export function PortfolioPage({ section }: PortfolioPageProps) {
  const allProjects = useProjectsStore((state) => state.projects);
  const selectedProjectId = useDrawerStore(selectEditingProjectId);
  // Hidden and trashed projects have their own pages. The project open in the drawer
  // stays drawn while visible, so changing its status never makes it vanish mid-edit.
  const visibleCount = useMemo(
    () => allProjects.filter((project) => isInSection(project, 'all')).length,
    [allProjects],
  );
  const projects = useMemo(
    () =>
      allProjects.filter(
        (project) =>
          isInSection(project, section) ||
          (project.id === selectedProjectId && isInSection(project, 'all')),
      ),
    [allProjects, section, selectedProjectId],
  );
  const openProject = useDrawerStore((state) => state.openProject);
  const openCreate = useDrawerStore((state) => state.openCreate);
  const expandedProjectId = useDrawerStore((state) => state.expandedProjectId);
  const clearFilters = useFiltersStore((state) => state.clearAll);
  const filtered = useFilteredProjects(projects, selectedProjectId);
  // Samples live in "Exemplos": with only samples installed, the portfolio is still empty.
  const ownCount = useMemo(() => selectOwnProjects(allProjects).length, [allProjects]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Everything that chooses what the timeline shows lives in the sidebar.
  const tools: PageTools = {
    expanded: (
      <>
        <TimelineViewControls
          projects={filtered.projects}
          onShowShortcuts={() => {
            setShortcutsOpen(true);
          }}
        />
        <FilterPanel projects={projects} matchCount={filtered.matchCount} />
      </>
    ),
    collapsed: (
      <>
        <TimelineRailControls />
        <FilterRailButton />
      </>
    ),
  };

  /** Brings a newly created project into view when it starts or ends off-screen. */
  const revealProject = useCallback((project: Project) => {
    const { start, end } = isoRangeToDays(project.startDate, project.endDate);
    const { viewport, centerOn } = useViewportStore.getState();
    if (!isRangeVisible(start, end, viewport)) centerOn((start + end) / 2);
  }, []);

  const emptyState =
    ownCount === 0 ? (
      <TimelineEmptyState
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={openCreate}>
              <Plus />
              Criar projeto
            </Button>
            <a href={EXAMPLES_HREF} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <FlaskConical />
              Explorar exemplos
            </a>
          </div>
        }
      />
    ) : visibleCount === 0 ? (
      // Everything is hidden or in the trash: never offer to replace that data here.
      <TimelineEmptyState
        icon={EyeOff}
        title="Nenhum projeto visível"
        description="Os projetos existentes estão ocultos ou na lixeira."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={openCreate}>
              <Plus />
              Criar projeto
            </Button>
            <a href={HIDDEN_HREF} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              Ver ocultos
            </a>
            <a href={TRASH_HREF} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              Ver lixeira
            </a>
          </div>
        }
      />
    ) : projects.length === 0 ? (
      <TimelineEmptyState
        icon={Inbox}
        title={`Nenhum projeto em “${SECTION_META[section].label}”`}
        description="Os outros projetos estão nas demais seções."
        action={
          <a href={PORTFOLIO_HREF} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            Ver todos os projetos
          </a>
        }
      />
    ) : (
      <TimelineEmptyState
        icon={SearchX}
        title="Nenhum projeto com esses filtros"
        description="Ajuste os filtros ou limpe-os para ver todos os projetos."
        action={
          <Button size="sm" variant="outline" onClick={clearFilters}>
            Limpar filtros
          </Button>
        }
      />
    );

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      {/* First focusable element: lets keyboard users skip the header toolbar. */}
      <a
        href="#timeline"
        onClick={(event) => {
          // Move focus explicitly: following a fragment link does not do it in every browser.
          event.preventDefault();
          document.getElementById('timeline')?.focus();
        }}
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-popover focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para a linha do tempo
      </a>
      <AppHeader
        leading={<NavigationDrawerButton current={section} tools={tools} />}
        actions={
          <>
            <NewProjectButton />
            <DataMenu />
            <ThemeToggle />
          </>
        }
      />
      {/* Zoom "fit" and the shortcuts act on what is on screen. */}
      <TimelineShortcuts
        projects={filtered.projects}
        helpOpen={shortcutsOpen}
        onHelpOpenChange={setShortcutsOpen}
        enabled={expandedProjectId === null}
      />

      <div className="flex min-h-0 flex-1">
        <NavigationRail current={section} tools={tools} />
        <main
          id="timeline"
          tabIndex={-1}
          aria-label={SECTION_META[section].label}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-sunken outline-none"
        >
          <Timeline
            projects={filtered.projects}
            horizons={filtered.horizons}
            selectedProjectId={selectedProjectId}
            onSelectProject={openProject}
            emptyState={emptyState}
          />
        </main>
      </div>

      <ProjectPanel onProjectCreated={revealProject} />
    </div>
  );
}

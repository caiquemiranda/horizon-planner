import { EyeOff, FlaskConical, Plus, SearchX } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { DataMenu } from '@/features/data-io/components/DataMenu';
import { useDataActions } from '@/features/data-io/hooks/useDataActions';
import { ActiveFiltersBar } from '@/features/filters/components/ActiveFiltersBar';
import { FilterMenu } from '@/features/filters/components/FilterMenu';
import { useFilteredProjects } from '@/features/filters/hooks/useFilteredProjects';
import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { NewProjectButton } from '@/features/projects/components/NewProjectButton';
import { ProjectPanel } from '@/features/projects/components/ProjectPanel';
import { ProjectViewsMenu } from '@/features/projects/components/ProjectViewsMenu';
import { selectByPlacement } from '@/features/projects/lib/visibility';
import { selectEditingProjectId, useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { Timeline } from '@/features/timeline/components/Timeline';
import { TimelineEmptyState } from '@/features/timeline/components/TimelineEmptyState';
import { TimelineToolbar } from '@/features/timeline/components/TimelineToolbar';
import { isRangeVisible } from '@/features/timeline/lib/layout';
import { isoRangeToDays } from '@/features/timeline/lib/time';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { HIDDEN_HREF, TRASH_HREF } from '@/lib/router';
import type { Project } from '@/types/project';

/** The portfolio: every project on the strategic timeline. */
export function PortfolioPage() {
  const allProjects = useProjectsStore((state) => state.projects);
  // Hidden and trashed projects have their own pages (see ProjectViewsMenu).
  const projects = useMemo(() => selectByPlacement(allProjects, 'listed'), [allProjects]);
  const selectedProjectId = useDrawerStore(selectEditingProjectId);
  const openProject = useDrawerStore((state) => state.openProject);
  const openCreate = useDrawerStore((state) => state.openCreate);
  const clearFilters = useFiltersStore((state) => state.clearAll);
  const filtered = useFilteredProjects(projects, selectedProjectId);
  const { loadSample } = useDataActions();

  /** Brings a newly created project into view when it starts or ends off-screen. */
  const revealProject = useCallback((project: Project) => {
    const { start, end } = isoRangeToDays(project.startDate, project.endDate);
    const { viewport, centerOn } = useViewportStore.getState();
    if (!isRangeVisible(start, end, viewport)) centerOn((start + end) / 2);
  }, []);

  const emptyState =
    allProjects.length === 0 ? (
      <TimelineEmptyState
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={openCreate}>
              <Plus />
              Criar projeto
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void loadSample();
              }}
            >
              <FlaskConical />
              Carregar dados de exemplo
            </Button>
          </div>
        }
      />
    ) : projects.length === 0 ? (
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
        actions={
          <>
            <NewProjectButton />
            <ProjectViewsMenu />
            <DataMenu />
            <ThemeToggle />
          </>
        }
      >
        <FilterMenu projects={projects} />
        {/* Zoom "fit" and shortcuts act on what is on screen. */}
        <TimelineToolbar projects={filtered.projects} />
      </AppHeader>

      <main
        id="timeline"
        tabIndex={-1}
        className="relative flex min-h-0 flex-1 flex-col bg-surface-sunken outline-none"
      >
        <ActiveFiltersBar matchCount={filtered.matchCount} totalCount={projects.length} />
        <Timeline
          projects={filtered.projects}
          horizons={filtered.horizons}
          selectedProjectId={selectedProjectId}
          onSelectProject={openProject}
          emptyState={emptyState}
        />
      </main>

      <ProjectPanel onProjectCreated={revealProject} />
    </div>
  );
}

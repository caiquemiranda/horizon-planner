import { Plus, SearchX } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { ActiveFiltersBar } from '@/features/filters/components/ActiveFiltersBar';
import { FilterMenu } from '@/features/filters/components/FilterMenu';
import { useFilteredProjects } from '@/features/filters/hooks/useFilteredProjects';
import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { NewProjectButton } from '@/features/projects/components/NewProjectButton';
import { ProjectPanel } from '@/features/projects/components/ProjectPanel';
import { ProjectsErrorAlert } from '@/features/projects/components/ProjectsErrorAlert';
import { selectEditingProjectId, useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { Timeline } from '@/features/timeline/components/Timeline';
import { TimelineEmptyState } from '@/features/timeline/components/TimelineEmptyState';
import { TimelineToolbar } from '@/features/timeline/components/TimelineToolbar';
import { isRangeVisible } from '@/features/timeline/lib/layout';
import { isoRangeToDays } from '@/features/timeline/lib/time';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import type { Project } from '@/types/project';

export function App() {
  const projects = useProjectsStore((state) => state.projects);
  const load = useProjectsStore((state) => state.load);
  const selectedProjectId = useDrawerStore(selectEditingProjectId);
  const openProject = useDrawerStore((state) => state.openProject);
  const openCreate = useDrawerStore((state) => state.openCreate);
  const clearFilters = useFiltersStore((state) => state.clearAll);
  const filtered = useFilteredProjects(projects, selectedProjectId);

  useEffect(() => {
    void load();
  }, [load]);

  /** Brings a newly created project into view when it starts or ends off-screen. */
  const revealProject = useCallback((project: Project) => {
    const { start, end } = isoRangeToDays(project.startDate, project.endDate);
    const { viewport, centerOn } = useViewportStore.getState();
    if (!isRangeVisible(start, end, viewport)) centerOn((start + end) / 2);
  }, []);

  const emptyState =
    projects.length === 0 ? (
      <TimelineEmptyState
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Criar projeto
          </Button>
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
      <AppHeader
        actions={
          <>
            <NewProjectButton />
            <ThemeToggle />
          </>
        }
      >
        <FilterMenu projects={projects} />
        {/* Zoom "fit" and shortcuts act on what is on screen. */}
        <TimelineToolbar projects={filtered.projects} />
      </AppHeader>

      <main className="relative flex min-h-0 flex-1 flex-col bg-surface-sunken">
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
      <ProjectsErrorAlert />
    </div>
  );
}

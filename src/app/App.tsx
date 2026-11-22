import { useEffect } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { ProjectPanel } from '@/features/projects/components/ProjectPanel';
import { selectEditingProjectId, useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { Timeline } from '@/features/timeline/components/Timeline';
import { TimelineToolbar } from '@/features/timeline/components/TimelineToolbar';

export function App() {
  const projects = useProjectsStore((state) => state.projects);
  const load = useProjectsStore((state) => state.load);
  const selectedProjectId = useDrawerStore(selectEditingProjectId);
  const openProject = useDrawerStore((state) => state.openProject);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader actions={<ThemeToggle />}>
        <TimelineToolbar projects={projects} />
      </AppHeader>

      <main className="relative flex min-h-0 flex-1 flex-col bg-surface-sunken">
        <Timeline
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={openProject}
        />
      </main>

      <ProjectPanel />
    </div>
  );
}

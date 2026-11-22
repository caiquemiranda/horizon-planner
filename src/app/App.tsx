import { useEffect } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { Timeline } from '@/features/timeline/components/Timeline';
import { TimelineToolbar } from '@/features/timeline/components/TimelineToolbar';

export function App() {
  const projects = useProjectsStore((state) => state.projects);
  const load = useProjectsStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader actions={<ThemeToggle />}>
        <TimelineToolbar projects={projects} />
      </AppHeader>

      <main className="relative flex min-h-0 flex-1 flex-col bg-surface-sunken">
        <Timeline projects={projects} />
      </main>
    </div>
  );
}

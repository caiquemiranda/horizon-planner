import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useStoredProjects } from '@/features/projects/hooks/useStoredProjects';
import { Timeline } from '@/features/timeline/components/Timeline';

export function App() {
  const projects = useStoredProjects();

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader actions={<ThemeToggle />} />

      <main className="relative flex min-h-0 flex-1 flex-col bg-surface-sunken">
        <Timeline projects={projects} />
      </main>
    </div>
  );
}

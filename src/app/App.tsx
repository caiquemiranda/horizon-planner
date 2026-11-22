import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Timeline } from '@/features/timeline/components/Timeline';

export function App() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader actions={<ThemeToggle />} />

      <main className="relative flex min-h-0 flex-1 flex-col bg-surface-sunken">
        <Timeline />
      </main>
    </div>
  );
}

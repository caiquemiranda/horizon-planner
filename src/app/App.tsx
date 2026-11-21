import { CalendarRange } from 'lucide-react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { HORIZON_META } from '@/features/projects/constants';
import { HORIZONS } from '@/types/project';

export function App() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader actions={<ThemeToggle />} />

      <main className="relative flex min-h-0 flex-1 flex-col bg-surface-sunken">
        <section aria-label="Horizontes" className="border-b">
          {HORIZONS.map((horizon) => {
            const meta = HORIZON_META[horizon];
            return (
              <div
                key={horizon}
                className="flex h-(--lane-header-height) items-center gap-2 border-b px-4 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: `var(${meta.cssVar})` }}
                />
                <span className="text-sm font-medium">{meta.label}</span>
                <span className="text-xs text-muted-foreground">{meta.description}</span>
              </div>
            );
          })}
        </section>

        <div className="flex flex-1 animate-fade-in flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-xl border bg-background text-horizon-long">
            <CalendarRange aria-hidden="true" className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">Sua linha do tempo está vazia</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crie seu primeiro projeto ou carregue os dados de exemplo para começar a planejar.
          </p>
        </div>
      </main>
    </div>
  );
}

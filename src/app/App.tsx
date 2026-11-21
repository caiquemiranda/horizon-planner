import { CalendarRange } from 'lucide-react';

export function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-xl bg-secondary text-horizon-long">
        <CalendarRange aria-hidden="true" className="size-6" />
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">Horizon</h1>
      <p className="max-w-md text-muted-foreground">
        Strategic timeline for your short, medium and long-term projects.
      </p>
    </main>
  );
}

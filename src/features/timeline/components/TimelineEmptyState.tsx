import { CalendarRange, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface TimelineEmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  /** Call to action, e.g. a "create project" button. */
  action?: ReactNode;
}

export function TimelineEmptyState({
  title = 'Sua linha do tempo está vazia',
  description = 'Crie seu primeiro projeto ou carregue os dados de exemplo para começar a planejar.',
  icon: Icon = CalendarRange,
  action,
}: TimelineEmptyStateProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex animate-fade-in flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-xl border bg-background text-horizon-long shadow-sm">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="pointer-events-auto mt-2">{action}</div> : null}
    </div>
  );
}

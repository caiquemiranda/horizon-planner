import { CircleAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useProjectsStore } from '../store/projectsStore';

/** Shows the last persistence error (e.g. a change that was rolled back). */
export function ProjectsErrorAlert() {
  const error = useProjectsStore((state) => state.error);
  const clearError = useProjectsStore((state) => state.clearError);

  if (!error) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 z-50 flex max-w-sm animate-fade-in items-start gap-2.5 rounded-lg border border-destructive/40 bg-popover p-3 pr-2 text-sm text-popover-foreground shadow-popover"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="flex-1">{error}</p>
      <Button variant="ghost" size="icon-xs" aria-label="Dispensar aviso" onClick={clearError}>
        <X />
      </Button>
    </div>
  );
}

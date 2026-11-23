import { ExternalLink, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useScheduleStore } from '@/features/schedule/store';
import { isEditingText, isEscapeHeld } from '@/lib/escapeGuard';
import { projectHref } from '@/lib/router';
import { cn } from '@/lib/utils';

import { ProjectWorkspace } from './ProjectWorkspace';

/**
 * The project's planning workspace in a large dialog over the current page: the same
 * `ProjectWorkspace` as the full page (one table, one chart, one store), so values and
 * percentages cannot diverge. The route does not change; closing returns to the page
 * exactly as it was, and "Abrir página completa" navigates to the project's route.
 *
 * Escape closes it unless it belongs to something inside (a cell being edited, a drag, a
 * menu or a nested dialog). Clicking outside never closes it, so no edit is lost by
 * accident. Changes that are not stored yet ask for confirmation before closing.
 */
export function ExpandedProjectDialog() {
  const projectId = useDrawerStore((state) => state.expandedProjectId);
  const closeExpanded = useDrawerStore((state) => state.closeExpanded);
  const hasUnsavedChanges = useScheduleStore(
    (state) =>
      state.saveStatus === 'saving' ||
      state.saveStatus === 'error' ||
      state.saveStatus === 'conflict',
  );
  const [confirmClose, setConfirmClose] = useState(false);
  // Opened from a store, not a Radix trigger: remember who had focus to give it back.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const requestClose = () => {
    if (hasUnsavedChanges) setConfirmClose(true);
    else closeExpanded();
  };

  const actions = projectId ? (
    <>
      <a
        href={projectHref(projectId)}
        onClick={closeExpanded}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'hidden sm:inline-flex')}
      >
        <ExternalLink />
        Abrir página completa
      </a>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Fechar visualização ampliada"
        onClick={requestClose}
      >
        <X />
      </Button>
    </>
  ) : null;

  return (
    <>
      <Dialog.Root
        open={projectId !== null}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <Dialog.Portal>
          {/* Light blur where supported; a plain dim layer keeps the contrast elsewhere. */}
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 supports-backdrop-filter:bg-black/25 supports-backdrop-filter:backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:inset-[max(1rem,2vh)_max(1rem,2vw)] sm:rounded-xl sm:border sm:shadow-popover"
            onOpenAutoFocus={() => {
              const previous = document.activeElement;
              returnFocusRef.current = previous instanceof HTMLElement ? previous : null;
            }}
            onCloseAutoFocus={(event) => {
              const target = returnFocusRef.current;
              if (target?.isConnected) {
                event.preventDefault();
                target.focus();
              }
            }}
            onInteractOutside={(event) => {
              event.preventDefault();
            }}
            onEscapeKeyDown={(event) => {
              if (isEscapeHeld() || isEditingText(document.activeElement)) event.preventDefault();
            }}
          >
            {projectId ? (
              <ProjectWorkspace
                key={projectId}
                projectId={projectId}
                presentation="dialog"
                dialogActions={actions}
              />
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar com alterações não salvas?</AlertDialogTitle>
            <AlertDialogDescription>
              A última alteração do cronograma ainda não foi gravada. Ao fechar, ela pode ser
              perdida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={closeExpanded}
            >
              Fechar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

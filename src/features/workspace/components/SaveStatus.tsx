import { CloudAlert, CloudCheck, LoaderCircle, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useScheduleStore } from '@/features/schedule/store';

/**
 * "Salvando…", "Salvo", "Erro ao salvar" or a conflict with another tab, with the
 * actions that resolve each state. Announced politely to screen readers.
 */
export function SaveStatus() {
  const saveStatus = useScheduleStore((state) => state.saveStatus);
  const saveError = useScheduleStore((state) => state.saveError);
  const retrySave = useScheduleStore((state) => state.retrySave);
  const reload = useScheduleStore((state) => state.reload);
  const overwrite = useScheduleStore((state) => state.overwrite);
  const status = useScheduleStore((state) => state.status);

  if (status !== 'ready') return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <p role="status" className="flex items-center gap-1.5 text-muted-foreground">
        {saveStatus === 'saving' ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
            Salvando…
          </>
        ) : saveStatus === 'saved' ? (
          <>
            <CloudCheck aria-hidden="true" className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Salvo</span>
          </>
        ) : saveStatus === 'error' ? (
          <>
            <CloudAlert aria-hidden="true" className="size-3.5 text-destructive" />
            <span className="text-foreground">Erro ao salvar</span>
            <span className="sr-only">{saveError}</span>
          </>
        ) : (
          <>
            <TriangleAlert aria-hidden="true" className="size-3.5 text-destructive" />
            <span className="text-foreground">{saveError}</span>
          </>
        )}
      </p>
      {saveStatus === 'error' ? (
        <Button
          size="xs"
          variant="outline"
          title={saveError ?? undefined}
          onClick={() => {
            void retrySave();
          }}
        >
          Tentar de novo
        </Button>
      ) : null}
      {saveStatus === 'conflict' ? (
        <>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              void reload();
            }}
          >
            Recarregar
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              void overwrite();
            }}
          >
            Manter minhas alterações
          </Button>
        </>
      ) : null}
    </div>
  );
}

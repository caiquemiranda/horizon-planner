import { CalendarClock, Flag, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { STATUS_META } from '@/features/projects/constants';
import {
  computeForecast,
  formatVariance,
  type ScheduleForecast,
  workingDayVariance,
} from '@/features/schedule/lib/forecast';
import { formatDate } from '@/features/timeline/lib/format';
import { dayToIsoDate, getTodayIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';
import type { DayNumber } from '@/types/timeline';

import type { WorkspaceActions } from '../hooks/useWorkspaceActions';
import type { WorkspaceModel } from '../hooks/useWorkspaceModel';

interface ForecastPanelProps {
  project: Project;
  model: WorkspaceModel;
  actions: WorkspaceActions;
  readOnly: boolean;
}

const dateOf = (day: DayNumber) => formatDate(dayToIsoDate(day));

/**
 * The planned finish next to the forecast and, when saved, the baseline: three different
 * dates, each labelled, never one overwriting another. Details explain which tasks moved
 * the forecast.
 */
export function ForecastPanel({ project, model, actions, readOnly }: ForecastPanelProps) {
  const [open, setOpen] = useState(false);
  const today = getTodayIsoDate();
  const forecast = useMemo(
    () => computeForecast(model.schedule, model.result, today),
    [model.schedule, model.result, today],
  );

  if (forecast.plannedFinish === null || forecast.forecastFinish === null) return null;

  // A postponed or closed project has no running forecast: nothing should move on its own.
  const suspended = project.status === 'paused' || STATUS_META[project.status].isClosed;
  const late = forecast.variance > 0;
  const early = forecast.variance < 0;
  const baseline = model.schedule.baseline;
  const baselineVariance = baseline
    ? workingDayVariance(model.schedule, isoDateToDay(baseline.finish), forecast.forecastFinish)
    : null;

  return (
    <div
      role="group"
      aria-label="Previsão de término"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 text-xs"
    >
      <span className="text-muted-foreground">
        Término planejado{' '}
        <strong className="font-medium text-foreground">{dateOf(forecast.plannedFinish)}</strong>
      </span>
      {suspended ? (
        <span className="text-muted-foreground">
          Previsão suspensa: projeto {STATUS_META[project.status].label.toLowerCase()}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          Previsão{' '}
          <strong className="font-medium text-foreground">{dateOf(forecast.forecastFinish)}</strong>
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 font-medium',
              late && 'bg-destructive/10 text-destructive',
              early && 'bg-green-500/10 text-green-700 dark:text-green-400',
              !late && !early && 'bg-muted text-muted-foreground',
            )}
          >
            {late ? <TrendingUp aria-hidden="true" className="size-3" /> : null}
            {early ? <TrendingDown aria-hidden="true" className="size-3" /> : null}
            {formatVariance(forecast.variance)}
          </span>
        </span>
      )}
      {baseline ? (
        <span className="text-muted-foreground">
          Linha de base{' '}
          <strong className="font-medium text-foreground">{formatDate(baseline.finish)}</strong>
          {!suspended && baselineVariance !== null && baselineVariance !== 0
            ? ` (${formatVariance(baselineVariance)})`
            : ''}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        className="ml-auto"
        onClick={() => {
          setOpen(true);
        }}
      >
        <CalendarClock />
        Detalhes da previsão
      </Button>

      <ForecastDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        forecast={forecast}
        model={model}
        actions={actions}
        readOnly={readOnly}
        suspended={suspended}
        baselineVariance={baselineVariance}
      />
    </div>
  );
}

interface ForecastDialogProps {
  open: boolean;
  onClose: () => void;
  forecast: ScheduleForecast;
  model: WorkspaceModel;
  actions: WorkspaceActions;
  readOnly: boolean;
  suspended: boolean;
  baselineVariance: number | null;
}

function ForecastDialog({
  open,
  onClose,
  forecast,
  model,
  actions,
  readOnly,
  suspended,
  baselineVariance,
}: ForecastDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const baseline = model.schedule.baseline;
  const nameOf = (id: string) => {
    const task = model.schedule.tasks.find((item) => item.id === id);
    return `${model.wbs.get(id) ?? ''} ${task?.name ?? ''}`.trim();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Previsão de término</DialogTitle>
          <DialogDescription>
            Calculada a partir do trabalho que falta, das confirmações diárias, dos vínculos e do
            calendário. Trabalho ainda não confirmado conta como não feito, e pode ser confirmado
            depois em “Atividades do dia”.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Término planejado</dt>
          <dd>{dateOf(forecast.plannedFinish ?? 0)}</dd>
          <dt className="text-muted-foreground">Previsão atualizada</dt>
          <dd>
            {suspended
              ? 'Suspensa enquanto o projeto não estiver em andamento'
              : `${dateOf(forecast.forecastFinish ?? 0)} (${formatVariance(forecast.variance)})`}
          </dd>
          <dt className="text-muted-foreground">Linha de base</dt>
          <dd>
            {baseline
              ? `${formatDate(baseline.finish)}${
                  baselineVariance !== null && !suspended
                    ? ` (previsão ${formatVariance(baselineVariance)})`
                    : ''
                }`
              : 'Não salva'}
          </dd>
        </dl>

        {!suspended && forecast.causes.length > 0 ? (
          <section aria-label="Motivos" className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Por que mudou
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {forecast.causes.map((cause) => (
                <li key={cause.taskId} className="flex items-start gap-1.5">
                  <Flag aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {cause.deviation === 'late'
                    ? `${nameOf(cause.taskId)}: trabalho previsto ainda não confirmado; o que falta foi replanejado a partir de ${dateOf(forecast.dataDate)}.`
                    : `${nameOf(cause.taskId)}: concluída antes do previsto.`}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {baseline ? (
            <Button
              variant="ghost"
              disabled={readOnly}
              onClick={() => {
                setError(actions.clearBaseline());
              }}
            >
              Remover linha de base
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={readOnly}
            onClick={() => {
              setError(actions.saveBaseline());
            }}
          >
            {baseline ? 'Atualizar linha de base' : 'Salvar linha de base'}
          </Button>
        </DialogFooter>
        {baseline ? (
          <p className="text-xs text-muted-foreground">
            Linha de base salva em {formatDate(getTodayIsoDate(new Date(baseline.savedAt)))}.
            Atualizá-la substitui a referência pelo plano atual.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

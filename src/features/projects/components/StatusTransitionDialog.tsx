import { TriangleAlert } from 'lucide-react';
import { type SyntheticEvent, useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { countPendingLeafTasks } from '@/features/schedule/lib/tree';
import { formatDate } from '@/features/timeline/lib/format';
import { scheduleRepository } from '@/services/persistence';
import type { ISODate, Project } from '@/types/project';

import { FIELD_LIMITS } from '../constants';
import { type LifecycleAction, LifecycleError, type TransitionRequest } from '../lib/lifecycle';
import { useProjectsStore } from '../store/projectsStore';

interface StatusTransitionDialogProps {
  project: Project;
  /** The transition to confirm; `null` keeps the dialog closed. */
  action: LifecycleAction | null;
  today: ISODate;
  onClose: () => void;
}

const COPY: Record<LifecycleAction, { title: string; description: string; submit: string }> = {
  start: {
    title: 'Iniciar projeto',
    description: 'Registra o primeiro dia de trabalho efetivo. As datas planejadas não mudam.',
    submit: 'Iniciar',
  },
  postpone: {
    title: 'Adiar projeto',
    description:
      'Suspende a execução por decisão, sem apagar o progresso nem o plano. Informe ao menos uma previsão.',
    submit: 'Adiar',
  },
  resume: {
    title: 'Retomar projeto',
    description:
      'Volta para "Em andamento". As datas planejadas e o cronograma ficam como estão; ajuste-os se o adiamento mudou o prazo.',
    submit: 'Retomar',
  },
  complete: {
    title: 'Concluir projeto',
    description: 'Encerra o projeto com êxito. O cronograma passa a ser somente leitura.',
    submit: 'Concluir',
  },
  close: {
    title: 'Encerrar sem concluir',
    description:
      'Encerra o projeto sem atingir o objetivo (desistência ou interrupção). O progresso alcançado é mantido.',
    submit: 'Encerrar',
  },
  reopen: {
    title: 'Reabrir projeto',
    description: 'Volta para "Em andamento". O histórico de status é mantido.',
    submit: 'Reabrir',
  },
};

/** Confirms one lifecycle transition, asking only for the data that transition needs. */
export function StatusTransitionDialog({
  project,
  action,
  today,
  onClose,
}: StatusTransitionDialogProps) {
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        {/* Remounted for every action, so each opening starts from empty fields. */}
        {action ? (
          <TransitionForm
            key={action}
            project={project}
            action={action}
            today={today}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TransitionForm({
  project,
  action,
  today,
  onClose,
}: Omit<StatusTransitionDialogProps, 'action'> & { action: LifecycleAction }) {
  const transition = useProjectsStore((state) => state.transition);
  const ids = { date: useId(), reason: useId(), resume: useId(), finish: useId(), error: useId() };
  const [date, setDate] = useState<string>(today);
  const [reason, setReason] = useState('');
  const [expectedResumeAt, setExpectedResumeAt] = useState('');
  const [revisedFinish, setRevisedFinish] = useState('');
  const [error, setError] = useState<LifecycleError | null>(null);
  /** `null` while the schedule is being read. */
  const [pendingTasks, setPendingTasks] = useState<number | null>(action === 'complete' ? null : 0);

  useEffect(() => {
    if (action !== 'complete') return;
    let active = true;
    scheduleRepository
      .get(project.id)
      .then((schedule) => {
        if (active) setPendingTasks(schedule ? countPendingLeafTasks(schedule.tasks) : 0);
      })
      .catch(() => {
        // Without the schedule the dialog cannot warn; the rule then needs no reason.
        if (active) setPendingTasks(0);
      });
    return () => {
      active = false;
    };
  }, [action, project.id]);

  const copy = COPY[action];
  const asksDate = action === 'start' || action === 'complete' || action === 'close';
  const asksReason = action !== 'start' && action !== 'resume';
  const reasonRequired =
    action === 'postpone' ||
    action === 'close' ||
    (action === 'complete' && (pendingTasks ?? 0) > 0);
  const lateBy = action === 'complete' && date > project.endDate;

  function buildRequest(): TransitionRequest {
    const day = date as ISODate;
    switch (action) {
      case 'start':
        return { action, date: day };
      case 'postpone':
        return {
          action,
          reason,
          expectedResumeAt: expectedResumeAt === '' ? null : (expectedResumeAt as ISODate),
          revisedFinish: revisedFinish === '' ? null : (revisedFinish as ISODate),
        };
      case 'resume':
        return { action };
      case 'complete':
        return { action, date: day, reason };
      case 'close':
        return { action, date: day, reason };
      case 'reopen':
        return { action, reason };
    }
  }

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (pendingTasks === null) return;
    if (asksDate && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError(new LifecycleError('Informe a data.', 'date'));
      return;
    }
    try {
      await transition(project.id, buildRequest(), pendingTasks);
      onClose();
    } catch (caught) {
      if (caught instanceof LifecycleError) setError(caught);
      else throw caught;
    }
  }

  const invalid = (field: LifecycleError['field']) =>
    error?.field === field ? { 'aria-invalid': true, 'aria-describedby': ids.error } : {};

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      {action === 'complete' && pendingTasks !== null && pendingTasks > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          />
          {pendingTasks === 1
            ? 'Há 1 tarefa do cronograma ainda não concluída.'
            : `Há ${String(pendingTasks)} tarefas do cronograma ainda não concluídas.`}{' '}
          Para concluir mesmo assim, justifique.
        </p>
      ) : null}

      {asksDate ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.date}>
            {action === 'start'
              ? 'Data de início'
              : action === 'complete'
                ? 'Data de conclusão'
                : 'Data de encerramento'}
          </Label>
          <Input
            id={ids.date}
            type="date"
            value={date}
            max={today}
            required
            onChange={(event) => {
              setDate(event.target.value);
            }}
            {...invalid('date')}
          />
          {lateBy ? (
            <p className="text-xs text-muted-foreground">
              Depois do término planejado ({formatDate(project.endDate)}).
            </p>
          ) : null}
        </div>
      ) : null}

      {action === 'postpone' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.resume}>Previsão de retomada</Label>
            <Input
              id={ids.resume}
              type="date"
              value={expectedResumeAt}
              min={today}
              onChange={(event) => {
                setExpectedResumeAt(event.target.value);
              }}
              {...invalid('expectedResumeAt')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.finish}>Novo término previsto</Label>
            <Input
              id={ids.finish}
              type="date"
              value={revisedFinish}
              min={expectedResumeAt || today}
              onChange={(event) => {
                setRevisedFinish(event.target.value);
              }}
              {...invalid('revisedFinish')}
            />
          </div>
          <p className="col-span-2 text-xs text-muted-foreground">
            O término planejado ({formatDate(project.endDate)}) é mantido como referência.
          </p>
        </div>
      ) : null}

      {asksReason ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.reason}>
            {action === 'complete' && reasonRequired ? 'Justificativa' : 'Motivo'}
            {reasonRequired ? null : (
              <span className="font-normal text-muted-foreground"> (opcional)</span>
            )}
          </Label>
          <Textarea
            id={ids.reason}
            value={reason}
            rows={3}
            maxLength={FIELD_LIMITS.lifecycleReasonMax}
            required={reasonRequired}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            {...invalid('reason')}
          />
        </div>
      ) : null}

      {error ? (
        <p id={ids.error} role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant={action === 'close' ? 'destructive' : 'default'}
          disabled={pendingTasks === null}
        >
          {copy.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

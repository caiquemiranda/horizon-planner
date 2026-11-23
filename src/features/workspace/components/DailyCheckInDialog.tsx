import { Check, CheckCheck, CircleDashed, Clock, Undo2, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createWorkCalendar } from '@/features/schedule/lib/calendar';
import {
  type AgendaItem,
  type AgendaState,
  formatDays,
  getDailyAgenda,
} from '@/features/schedule/lib/checkIns';
import { formatDate } from '@/features/timeline/lib/format';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { cn } from '@/lib/utils';
import type { ISODate } from '@/types/project';

import type { WorkspaceActions } from '../hooks/useWorkspaceActions';
import type { WorkspaceModel } from '../hooks/useWorkspaceModel';

interface DailyCheckInDialogProps {
  open: boolean;
  model: WorkspaceModel;
  actions: WorkspaceActions;
  readOnly: boolean;
  onClose: () => void;
}

const STATE_META: Record<AgendaState, { label: string; className: string }> = {
  pending: { label: 'Pendente de confirmação', className: 'text-muted-foreground' },
  done: { label: 'Feito', className: 'text-green-700 dark:text-green-400' },
  not_done: { label: 'Não realizado', className: 'text-amber-700 dark:text-amber-300' },
};

/**
 * "Atividades do dia": confirms, for a date (today by default, or an earlier day), the
 * work of each task planned for it, and lists the unfinished tasks already late. Every
 * confirmation goes through the schedule store, so the table, the bars and the project
 * percentage update at once and the change is saved like any other edit.
 */
export function DailyCheckInDialog({
  open,
  model,
  actions,
  readOnly,
  onClose,
}: DailyCheckInDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {open ? <DailyAgendaView model={model} actions={actions} readOnly={readOnly} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DailyAgendaView({
  model,
  actions,
  readOnly,
}: Omit<DailyCheckInDialogProps, 'open' | 'onClose'>) {
  const today = getTodayIsoDate();
  const [date, setDate] = useState<ISODate>(today);
  const [error, setError] = useState<string | null>(null);
  const dateId = useId();
  const calendar = useMemo(
    () => createWorkCalendar(model.schedule.calendar),
    [model.schedule.calendar],
  );
  const agenda = useMemo(
    () => getDailyAgenda(model.schedule, model.result, calendar, date),
    [model.schedule, model.result, calendar, date],
  );
  const isToday = date === today;

  const run = (message: string | null) => {
    setError(message);
  };

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Atividades do dia</DialogTitle>
        <DialogDescription>
          Confirme o trabalho de cada tarefa prevista. Um dia confirmado conta como um dia de
          trabalho; a tarefa só é concluída quando todo o trabalho dela é confirmado.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={dateId}>Dia do trabalho</Label>
          <Input
            id={dateId}
            type="date"
            value={date}
            max={today}
            className="w-44"
            onChange={(event) => {
              const value = event.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today) {
                setDate(value as ISODate);
                setError(null);
              }
            }}
          />
        </div>
        {isToday ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDate(today);
              setError(null);
            }}
          >
            Voltar para hoje
          </Button>
        )}
        <p className="pb-2 text-sm text-muted-foreground">
          {isToday ? 'Hoje' : 'Registro retroativo'}, {formatDate(date)}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!agenda.isWorkingDay ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Dia sem trabalho no calendário do projeto: nada a confirmar.
        </p>
      ) : null}

      <Section
        title="Previstas para o dia"
        empty={agenda.isWorkingDay ? 'Nenhuma tarefa prevista para este dia.' : null}
        items={agenda.planned}
        model={model}
        actions={actions}
        readOnly={readOnly}
        date={date}
        onResult={run}
      />
      {agenda.overdue.length > 0 ? (
        <Section
          title="Atrasadas"
          empty={null}
          items={agenda.overdue}
          model={model}
          actions={actions}
          readOnly={readOnly}
          date={date}
          onResult={run}
        />
      ) : null}
    </div>
  );
}

interface SectionProps {
  title: string;
  empty: string | null;
  items: AgendaItem[];
  model: WorkspaceModel;
  actions: WorkspaceActions;
  readOnly: boolean;
  date: ISODate;
  onResult: (message: string | null) => void;
}

function Section({ title, empty, items, model, actions, readOnly, date, onResult }: SectionProps) {
  if (items.length === 0 && !empty) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <AgendaRow
              key={item.task.id}
              item={item}
              wbs={model.wbs.get(item.task.id) ?? ''}
              actions={actions}
              readOnly={readOnly}
              date={date}
              onResult={onResult}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface AgendaRowProps {
  item: AgendaItem;
  wbs: string;
  actions: WorkspaceActions;
  readOnly: boolean;
  date: ISODate;
  onResult: (message: string | null) => void;
}

function AgendaRow({ item, wbs, actions, readOnly, date, onResult }: AgendaRowProps) {
  const { task, state, complete, overdue } = item;
  const isMilestone = task.duration === 0;
  const meta = STATE_META[state];
  const name = `${wbs} ${task.name}`.trim();
  const remaining = Math.max(0, task.duration - task.completedWork);
  const StateIcon = state === 'done' ? Check : state === 'not_done' ? X : CircleDashed;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">{wbs}</span>
          {task.name}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className={cn('inline-flex items-center gap-1', meta.className)}>
            <StateIcon aria-hidden="true" className="size-3.5" />
            {meta.label}
            {state === 'done' && item.checkIn && !isMilestone
              ? ` (${formatDays(item.checkIn.units)})`
              : ''}
          </span>
          <span>
            {task.progress}%
            {isMilestone
              ? ' · marco'
              : ` · ${formatDays(task.completedWork)} de ${formatDays(task.duration)}`}
          </span>
          {overdue ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <Clock aria-hidden="true" className="size-3.5" />
              Atrasada
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {state === 'pending' ? (
          <>
            {!complete && !isMilestone ? (
              <Button
                size="sm"
                variant="outline"
                disabled={readOnly}
                aria-label={`Feito (${formatDays(Math.min(1, remaining))}): ${name}`}
                onClick={() => {
                  onResult(actions.checkIn({ taskId: task.id, workDate: date, state: 'done' }));
                }}
              >
                <Check />
                Feito ({formatDays(Math.min(1, remaining))})
              </Button>
            ) : null}
            {!complete ? (
              <Button
                size="sm"
                variant="outline"
                disabled={readOnly}
                aria-label={`${isMilestone ? 'Marco atingido' : 'Concluir tarefa'}: ${name}`}
                onClick={() => {
                  onResult(actions.completeOn(task.id, date));
                }}
              >
                <CheckCheck />
                {isMilestone ? 'Marco atingido' : 'Concluir tarefa'}
              </Button>
            ) : null}
            {!complete ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={readOnly}
                aria-label={`Não realizado: ${name}`}
                onClick={() => {
                  onResult(actions.checkIn({ taskId: task.id, workDate: date, state: 'not_done' }));
                }}
              >
                <X />
                Não realizado
              </Button>
            ) : null}
            {complete ? <span className="text-xs text-muted-foreground">Concluída</span> : null}
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={readOnly}
            aria-label={`Desfazer confirmação: ${name}`}
            onClick={() => {
              onResult(actions.undoCheckIn(task.id, date));
            }}
          >
            <Undo2 />
            Desfazer
          </Button>
        )}
      </div>
    </li>
  );
}

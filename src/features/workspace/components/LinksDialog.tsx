import { Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DEPENDENCY_TYPE_META, describeDependency } from '@/features/schedule/lib/dependencies';
import { getTasksInWbsOrder } from '@/features/schedule/lib/tree';
import { cn } from '@/lib/utils';
import type { UUID } from '@/types/project';
import { DEPENDENCY_TYPES, type DependencyType, type TaskDependency } from '@/types/schedule';

import type { WorkspaceActions } from '../hooks/useWorkspaceActions';
import type { WorkspaceModel } from '../hooks/useWorkspaceModel';

interface LinksDialogProps {
  model: WorkspaceModel;
  actions: WorkspaceActions;
  /** Task whose links are shown; `null` closes the dialog. */
  taskId: UUID | null;
  /** Link to focus when opening (e.g. the connector that was clicked). */
  focusLinkId?: UUID | null;
  onClose: () => void;
}

const fieldClass =
  'h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';

function typeLabel(type: DependencyType) {
  return `${DEPENDENCY_TYPE_META[type].label} (${DEPENDENCY_TYPE_META[type].short})`;
}

function LagInput({
  value,
  label,
  onCommit,
}: {
  value: number;
  label: string;
  onCommit: (lag: number) => string | null;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }
  const commit = () => {
    const lag = Number(text);
    if (text.trim() === '' || !Number.isInteger(lag)) {
      setText(String(value));
      return;
    }
    if (lag !== value && onCommit(lag) !== null) setText(String(value));
  };
  return (
    <input
      type="number"
      step={1}
      aria-label={label}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      className={cn(fieldClass, 'w-20 text-right tabular-nums')}
    />
  );
}

/**
 * The accessible way to manage links (the chart connectors and the drag gesture are
 * shortcuts to the same operations): list, change type and lag, delete and add
 * predecessors and successors of one task. Every change goes through the domain
 * commands, so cycles and duplicates are refused with a message.
 */
export function LinksDialog({ model, actions, taskId, focusLinkId, onClose }: LinksDialogProps) {
  const task = taskId ? model.index.byId.get(taskId) : undefined;
  const scheduled = taskId ? model.result.tasks.get(taskId) : undefined;
  const [error, setError] = useState<string | null>(null);
  const [lastTaskId, setLastTaskId] = useState(taskId);
  if (taskId !== lastTaskId) {
    setLastTaskId(taskId);
    setError(null);
  }

  const report = (message: string | null) => {
    setError(message);
    return message;
  };

  const describe = (id: UUID) => model.describeTask(id);
  const predecessors = model.schedule.dependencies.filter((link) => link.successorId === taskId);
  const successors = model.schedule.dependencies.filter((link) => link.predecessorId === taskId);
  const isSummary = scheduled?.kind === 'summary';

  // Leaf tasks that can still be linked to this one (no existing link in either direction).
  const linkedIds = new Set([
    ...predecessors.map((link) => link.predecessorId),
    ...successors.map((link) => link.successorId),
  ]);
  const candidates = getTasksInWbsOrder(model.index).filter(
    (item) =>
      item.id !== taskId &&
      !linkedIds.has(item.id) &&
      model.result.tasks.get(item.id)?.kind !== 'summary',
  );

  return (
    <Dialog
      open={task !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vínculos de “{taskId ? describe(taskId) : ''}”</DialogTitle>
          <DialogDescription>
            Defina quais tarefas vêm antes (predecessoras) e depois (sucessoras). O atraso é em dias
            úteis; use um número negativo para antecipar.
          </DialogDescription>
        </DialogHeader>

        {isSummary ? (
          <p className="text-sm text-muted-foreground">
            Tarefas resumo não têm vínculos: suas datas vêm das subtarefas. Vincule as subtarefas.
          </p>
        ) : task ? (
          <>
            <LinkSection
              title="Predecessoras"
              emptyText="Nenhuma predecessora: a tarefa começa na data definida."
              links={predecessors}
              otherEnd={(link) => link.predecessorId}
              model={model}
              actions={actions}
              focusLinkId={focusLinkId ?? null}
              report={report}
              describeLink={(link) => describeDependency(link, describe)}
            />
            <AddLinkForm
              legend="Adicionar predecessora"
              candidates={candidates}
              model={model}
              onAdd={(otherId, type, lag) =>
                report(actions.addLink({ predecessorId: otherId, successorId: task.id, type, lag }))
              }
            />
            <LinkSection
              title="Sucessoras"
              emptyText="Nenhuma sucessora."
              links={successors}
              otherEnd={(link) => link.successorId}
              model={model}
              actions={actions}
              focusLinkId={focusLinkId ?? null}
              report={report}
              describeLink={(link) => describeDependency(link, describe)}
            />
            <AddLinkForm
              legend="Adicionar sucessora"
              candidates={candidates}
              model={model}
              onAdd={(otherId, type, lag) =>
                report(actions.addLink({ predecessorId: task.id, successorId: otherId, type, lag }))
              }
            />
          </>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface LinkSectionProps {
  title: string;
  emptyText: string;
  links: readonly TaskDependency[];
  otherEnd: (link: TaskDependency) => UUID;
  model: WorkspaceModel;
  actions: WorkspaceActions;
  focusLinkId: UUID | null;
  report: (message: string | null) => string | null;
  describeLink: (link: TaskDependency) => string;
}

function LinkSection({
  title,
  emptyText,
  links,
  otherEnd,
  model,
  actions,
  focusLinkId,
  report,
  describeLink,
}: LinkSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-label">
        {title}
      </h3>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((link) => {
            const name = model.describeTask(otherEnd(link));
            return (
              <li
                key={link.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5',
                  focusLinkId === link.id && 'border-ring',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm" title={describeLink(link)}>
                  {name}
                  <span className="sr-only">. {describeLink(link)}</span>
                </span>
                <select
                  aria-label={`Tipo do vínculo com ${name}`}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- opened from this link's connector
                  autoFocus={focusLinkId === link.id}
                  value={link.type}
                  onChange={(event) => {
                    report(
                      actions.updateLink(link.id, { type: event.target.value as DependencyType }),
                    );
                  }}
                  className={fieldClass}
                >
                  {DEPENDENCY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
                <LagInput
                  value={link.lag}
                  label={`Atraso em dias úteis do vínculo com ${name}`}
                  onCommit={(lag) => report(actions.updateLink(link.id, { lag }))}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Excluir vínculo com ${name}`}
                  onClick={() => {
                    report(actions.removeLink(link.id));
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddLinkForm({
  legend,
  candidates,
  model,
  onAdd,
}: {
  legend: string;
  candidates: readonly { id: UUID }[];
  model: WorkspaceModel;
  onAdd: (otherId: UUID, type: DependencyType, lag: number) => string | null;
}) {
  const [otherId, setOtherId] = useState('');
  const [type, setType] = useState<DependencyType>('FS');
  const [lag, setLag] = useState('0');

  return (
    <form
      aria-label={legend}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const amount = Number(lag);
        if (!otherId || !Number.isInteger(amount)) return;
        if (onAdd(otherId, type, amount) === null) {
          setOtherId('');
          setLag('0');
        }
      }}
    >
      <select
        aria-label={`${legend}: tarefa`}
        value={otherId}
        onChange={(event) => {
          setOtherId(event.target.value);
        }}
        className={cn(fieldClass, 'min-w-0 flex-1')}
      >
        <option value="">{legend}…</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {model.describeTask(candidate.id)}
          </option>
        ))}
      </select>
      <select
        aria-label={`${legend}: tipo`}
        value={type}
        onChange={(event) => {
          setType(event.target.value as DependencyType);
        }}
        className={fieldClass}
      >
        {DEPENDENCY_TYPES.map((option) => (
          <option key={option} value={option}>
            {typeLabel(option)}
          </option>
        ))}
      </select>
      <input
        type="number"
        step={1}
        aria-label={`${legend}: atraso em dias úteis`}
        value={lag}
        onChange={(event) => {
          setLag(event.target.value);
        }}
        className={cn(fieldClass, 'w-20 text-right tabular-nums')}
      />
      <Button type="submit" size="sm" variant="outline" disabled={!otherId}>
        Adicionar
      </Button>
    </form>
  );
}

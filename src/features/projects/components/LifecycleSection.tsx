import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CirclePlay,
  CircleX,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate } from '@/features/timeline/lib/format';
import { cn } from '@/lib/utils';
import type { ISODate, Project, ProjectStatus } from '@/types/project';

import { STATUS_META } from '../constants';
import {
  ACTION_META,
  getAvailableActions,
  isProjectLate,
  type LifecycleAction,
} from '../lib/lifecycle';
import { StatusTransitionDialog } from './StatusTransitionDialog';

const STATUS_ICONS: Record<ProjectStatus, LucideIcon> = {
  planned: CircleDashed,
  in_progress: CirclePlay,
  paused: CirclePause,
  completed: CircleCheck,
  cancelled: CircleX,
};

/** Status label with an icon, so the state never depends on color alone. */
export function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {STATUS_META[status].label}
    </span>
  );
}

interface LifecycleSectionProps {
  project: Project;
  today: ISODate;
}

/** The project's status, its lifecycle facts, the allowed changes and the history. */
export function LifecycleSection({ project, today }: LifecycleSectionProps) {
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const { lifecycle } = project;
  const actions = getAvailableActions(project.status);
  const late = isProjectLate(project, today);
  const postponement = project.status === 'paused' ? lifecycle.postponement : null;

  const facts: [string, string][] = [];
  if (lifecycle.startedAt) facts.push(['Início real', formatDate(lifecycle.startedAt)]);
  if (postponement) {
    if (postponement.reason) facts.push(['Motivo do adiamento', postponement.reason]);
    facts.push([
      'Retomada prevista',
      postponement.expectedResumeAt
        ? formatDate(postponement.expectedResumeAt)
        : 'Sem previsão informada',
    ]);
    if (postponement.revisedFinish) {
      facts.push(['Novo término previsto', formatDate(postponement.revisedFinish)]);
    }
  }
  if (project.status === 'completed' && lifecycle.completedAt) {
    facts.push(['Concluído em', formatDate(lifecycle.completedAt)]);
  }
  if (project.status === 'cancelled') {
    if (lifecycle.closedAt) facts.push(['Encerrado em', formatDate(lifecycle.closedAt)]);
    if (lifecycle.closeReason) facts.push(['Motivo do encerramento', lifecycle.closeReason]);
  }

  return (
    <section aria-label="Status do projeto" className="flex flex-col gap-3 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={project.status} />
        {late ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Clock aria-hidden="true" className="size-3.5" />
            Atrasado
            <span className="sr-only">
              : o término planejado ({formatDate(project.endDate)}) já passou
            </span>
          </span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              Alterar status
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((item) => (
              <DropdownMenuItem
                key={item}
                onSelect={() => {
                  setAction(item);
                }}
              >
                {ACTION_META[item].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {facts.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {lifecycle.history.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground select-none">
            Histórico de status ({lifecycle.history.length})
          </summary>
          <ol className="mt-2 flex flex-col gap-1.5">
            {[...lifecycle.history].reverse().map((change) => (
              <li key={`${change.at}-${change.to}`}>
                <span className="text-muted-foreground tabular-nums">
                  {formatDate(change.effectiveDate)}
                </span>{' '}
                {change.from ? `${STATUS_META[change.from].label} → ` : 'Criado como '}
                {STATUS_META[change.to].label}
                {change.reason ? (
                  <span className="text-muted-foreground"> — {change.reason}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      <StatusTransitionDialog
        project={project}
        action={action}
        today={today}
        onClose={() => {
          setAction(null);
        }}
      />
    </section>
  );
}

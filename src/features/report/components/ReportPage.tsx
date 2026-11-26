import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { StatusPill } from '@/features/projects/components/LifecycleSection';
import {
  NavigationDrawerButton,
  NavigationRail,
} from '@/features/projects/components/NavigationSidebar';
import { COLOR_META, HORIZON_META } from '@/features/projects/constants';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { formatVariance } from '@/features/schedule/lib/forecast';
import { formatDate } from '@/features/timeline/lib/format';
import { getTodayIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { formatCellDate, formatDuration } from '@/features/workspace/lib/cells';
import { projectHref } from '@/lib/router';
import { cn } from '@/lib/utils';
import { scheduleRepository } from '@/services/persistence';
import type { UUID } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { STATE_FILLS } from '../lib/colors';
import {
  buildProjectReport,
  type ProjectReport,
  REPORT_STATE_LABELS,
  type ReportRow,
} from '../lib/report';
import { DatesChart, MilestonesChart, PhaseChart, StateChart } from './ReportCharts';
import { GanttLegend, ReportGantt, ReportGanttPages } from './ReportGantt';

type ScheduleState =
  | { status: 'loading' }
  | { status: 'ready'; schedule: ProjectSchedule | null }
  | { status: 'error' };

/** Reads the project's schedule and follows its changes (other tabs, the workspace). */
function useStoredSchedule(projectId: UUID): ScheduleState {
  const [state, setState] = useState<ScheduleState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    const read = () => {
      scheduleRepository
        .get(projectId)
        .then((schedule) => {
          if (active) setState({ status: 'ready', schedule });
        })
        .catch(() => {
          if (active) setState({ status: 'error' });
        });
    };
    read();
    const unsubscribe = scheduleRepository.subscribe((changed) => {
      if (changed === projectId) read();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [projectId]);
  return state;
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The project report page (spec REQ-RPT-04): its own page, filled from the current data
 * (see `lib/report.ts`). It prints as an A4 document (spec REQ-PRINT-01/02): the browser's
 * print dialog, opened from "Imprimir / Salvar em PDF", also saves it as a PDF; navigation
 * and controls are left out, the cards are not split and the Gantt is cut into pages.
 */
export function ReportPage({ projectId }: { projectId: UUID }) {
  const project = useProjectsStore((state) => state.projects.find((item) => item.id === projectId));
  const projectsStatus = useProjectsStore((state) => state.status);
  const stored = useStoredSchedule(projectId);
  // The moment the data was read: changes to the plan produce a new report.
  const [now, setNow] = useState(() => new Date());
  const schedule = stored.status === 'ready' ? stored.schedule : null;
  useEffect(() => {
    setNow(new Date());
  }, [schedule, project]);

  const result = useMemo(() => (schedule ? computeSchedule(schedule) : null), [schedule]);
  const report = useMemo(
    () =>
      project && stored.status === 'ready'
        ? buildProjectReport({
            project,
            schedule,
            today: getTodayIsoDate(now),
            now,
            ...(result ? { result } : {}),
          })
        : null,
    [project, schedule, stored.status, result, now],
  );

  useEffect(() => {
    if (!project) return;
    const previous = document.title;
    document.title = `Relatório · ${project.title} · Horizon`;
    return () => {
      document.title = previous;
    };
  }, [project]);

  const loading =
    projectsStatus === 'idle' || projectsStatus === 'loading' || stored.status === 'loading';

  return (
    <div className="flex h-svh flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
      <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b glass px-3 sm:px-4 print:hidden">
        <NavigationDrawerButton current={null} currentProjectId={projectId} />
        <a
          href={projectHref(projectId)}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            '-ml-1.5 text-muted-foreground',
          )}
        >
          <ArrowLeft />
          Voltar ao projeto
        </a>
        <div className="ml-auto flex items-center gap-1">
          {report ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              aria-label="Imprimir relatório"
              onClick={printReport}
            >
              <Printer />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 print:block">
        <div className="contents print:hidden">
          <NavigationRail current={null} currentProjectId={projectId} />
        </div>
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface-sunken print:overflow-visible print:bg-transparent">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando o relatório…</p>
          ) : !project ? (
            <p className="p-6 text-sm text-muted-foreground">
              Projeto não encontrado. Ele pode ter sido excluído ou o endereço está incorreto.
            </p>
          ) : stored.status === 'error' || !report ? (
            <p role="alert" className="p-6 text-sm text-destructive">
              Não foi possível ler o cronograma deste projeto.
            </p>
          ) : (
            <ReportDocument report={report} schedule={schedule} result={result} />
          )}
        </main>
      </div>
    </div>
  );
}

/** The browser's print dialog, where "Salvar como PDF" is one of the destinations. */
function printReport() {
  window.print();
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn('flex flex-col gap-3', className)}>
      <h2 className="break-after-avoid text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | undefined;
}) {
  return (
    <div className="flex break-inside-avoid flex-col gap-0.5 rounded-lg border bg-background px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {detail ? <dd className="text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

function ReportDocument({
  report,
  schedule,
  result,
}: {
  report: ProjectReport;
  schedule: ProjectSchedule | null;
  result: ReturnType<typeof computeSchedule> | null;
}) {
  const { project, dates } = report;
  const generated = dateTimeFormat.format(new Date(report.generatedAt));
  const milestonesDone = report.milestones.filter((milestone) => milestone.done).length;

  return (
    <article className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 print:max-w-none print:gap-6 print:p-0">
      <header className="flex break-inside-avoid flex-col gap-3 border-b pb-5">
        <p className="text-label">{report.title}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'size-3 shrink-0 rounded-full',
              COLOR_META[project.color].swatchClassName,
            )}
          />
          <h1 className="text-2xl font-semibold">{project.title}</h1>
          <StatusPill status={project.status} />
          {project.demo ? (
            <span className="rounded border px-1.5 text-xs font-medium text-muted-foreground">
              Exemplo com dados fictícios
            </span>
          ) : null}
        </div>
        {project.description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{project.description}</p>
        ) : null}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Dados considerados até:</dt>
            <dd>
              {generated} ({timeZone})
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Gerado em:</dt>
            <dd>{generated}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Horizonte:</dt>
            <dd>{HORIZON_META[project.horizon].label}</dd>
          </div>
          {project.category ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">Categoria:</dt>
              <dd>{project.category}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <Section title="Sumário executivo">
        {report.hasSchedule ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {report.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este projeto ainda não tem cronograma: o relatório mostra os dados do portfólio (datas e
            progresso informados no projeto).
          </p>
        )}
      </Section>

      <Section title="Indicadores">
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-4 print:grid-cols-4">
          <Kpi
            label="Progresso"
            value={`${String(report.progress.percent)}%`}
            {...(report.hasSchedule
              ? {
                  detail: `${String(report.progress.done)} de ${String(report.progress.total)} tarefas-folha concluídas; cada uma pesa o mesmo`,
                }
              : { detail: 'Informado no projeto' })}
          />
          <Kpi
            label="Tarefas"
            value={String(report.workTasks)}
            detail={
              report.kind === 'final'
                ? `${String(report.states.done)} concluídas, ${String(report.states.not_done)} não concluídas`
                : `${String(report.states.in_progress)} em andamento, ${String(report.states.late)} atrasadas`
            }
          />
          <Kpi
            label="Marcos"
            value={`${String(milestonesDone)} de ${String(report.milestones.length)}`}
            detail="atingidos"
          />
          <Kpi label="Início planejado" value={formatDate(dates.plannedStart)} />
          <Kpi label="Término planejado" value={formatDate(dates.plannedFinish)} />
          <Kpi
            label="Previsão de término"
            value={dates.forecastFinish ? formatDate(dates.forecastFinish) : '—'}
            detail={
              dates.forecastFinish && dates.forecastVariance !== null
                ? `${formatVariance(dates.forecastVariance)} em relação ao planejado`
                : report.kind === 'final'
                  ? 'Projeto encerrado'
                  : project.status === 'paused'
                    ? 'Suspensa: projeto adiado'
                    : 'Não disponível'
            }
          />
          <Kpi
            label="Término real"
            value={dates.actualFinish ? formatDate(dates.actualFinish) : '—'}
            detail={dates.actualFinish ? undefined : 'Ainda não ocorreu'}
          />
          <Kpi
            label="Linha de base"
            value={dates.baselineFinish ? formatDate(dates.baselineFinish) : '—'}
            detail={
              dates.baselineFinish
                ? dates.baselineVariance !== null
                  ? `${formatVariance(dates.baselineVariance)} em relação à linha de base`
                  : undefined
                : 'Não salva'
            }
          />
        </dl>
        {report.checkIns.done + report.checkIns.notDone > 0 ? (
          <p className="text-sm text-muted-foreground">
            Confirmações diárias: {report.checkIns.done} de trabalho feito e{' '}
            {report.checkIns.notDone} de trabalho não feito
            {report.checkIns.last ? `, a última em ${formatDate(report.checkIns.last)}` : ''}.
          </p>
        ) : null}
      </Section>

      {report.hasSchedule && schedule && result ? (
        <>
          <Section title="Gráficos">
            <div className="grid gap-3 lg:grid-cols-2 print:grid-cols-2">
              <PhaseChart report={report} />
              <StateChart report={report} />
              <DatesChart report={report} />
              <MilestonesChart report={report} />
            </div>
            <p className="text-xs text-muted-foreground">
              Não há curva de evolução: o Horizon guarda o estado atual do projeto, não o histórico
              de cada dia, e não reconstrói uma curva que não foi registrada.
            </p>
          </Section>

          <Attention report={report} />

          <Section title="Estrutura analítica (EAP)">
            <WbsTable rows={report.rows} />
          </Section>

          <Section title="Cronograma" className="print:break-before-page">
            <div className="flex flex-col gap-2 print:hidden">
              <div className="overflow-x-auto rounded-lg border bg-background p-2">
                <ReportGantt
                  project={project}
                  schedule={schedule}
                  result={result}
                  today={report.asOf}
                />
              </div>
              <GanttLegend />
            </div>
            <ReportGanttPages
              project={project}
              schedule={schedule}
              result={result}
              today={report.asOf}
              className="hidden flex-col gap-6 print:flex"
            />
          </Section>
        </>
      ) : null}

      <Section title="Notas">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
          <li>
            Progresso: média das tarefas-folha (cada uma com o mesmo peso); fases e marcos não são
            somados como trabalho. É o mesmo número da tabela e do gráfico do cronograma.
          </li>
          <li>
            Atrasada: o último dia útil planejado já passou na data de corte e o trabalho não
            terminou. Trabalho futuro nunca é contado como atraso.
          </li>
          <li>
            Previsão: o plano refeito a partir do que já foi feito; não é calculada para projetos
            adiados ou encerrados.
          </li>
          <li>Custos, horas e equipe não são registrados no Horizon e não aparecem aqui.</li>
        </ul>
      </Section>

      <footer className="flex flex-col gap-4 border-t pt-5">
        <div className="flex flex-col items-start gap-2 print:hidden">
          <Button size="lg" onClick={printReport}>
            <Printer />
            Imprimir / Salvar em PDF
          </Button>
          <p className="text-xs text-muted-foreground">
            No diálogo de impressão, escolha “Salvar como PDF” para guardar o arquivo.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {report.title} · {project.title} · documento {documentId(report)} · gerado em {generated}{' '}
          pelo Horizon
        </p>
      </footer>
    </article>
  );
}

/** A stable reference for the printed copy: kind, project and data date. */
function documentId(report: ProjectReport): string {
  const kind = report.kind === 'final' ? 'RF' : 'RA';
  return `${kind}-${report.project.id.slice(0, 8).toUpperCase()}-${report.asOf.replaceAll('-', '')}`;
}

function RowList({ rows, empty }: { rows: ReportRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap gap-x-2">
          <span className="font-mono text-xs text-muted-foreground">{row.wbs}</span>
          <span>{row.name}</span>
          <span className="text-muted-foreground">
            {row.kind === 'milestone'
              ? formatDate(row.start)
              : `${formatDate(row.start)} – ${formatDate(row.finish)} · ${String(row.progress)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Attention({ report }: { report: ProjectReport }) {
  const { attention } = report;
  if (report.kind === 'final') {
    const notDone = report.rows.filter((row) => row.state === 'not_done');
    return (
      <Section title="Encerramento">
        <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
          <div className="flex break-inside-avoid flex-col gap-2 rounded-lg border bg-background p-4">
            <h3 className="text-sm font-semibold">Não concluídas ({notDone.length})</h3>
            <RowList rows={notDone} empty="Todas as tarefas foram concluídas." />
          </div>
          <div className="flex break-inside-avoid flex-col gap-2 rounded-lg border bg-background p-4">
            <h3 className="text-sm font-semibold">Marcos</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {report.milestones.map((milestone) => (
                <li key={milestone.id}>
                  {milestone.name} · {formatDate(milestone.date)} ·{' '}
                  {milestone.done ? 'atingido' : 'não atingido'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    );
  }
  return (
    <Section title="Pendências e próximos passos">
      <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
        <div className="flex break-inside-avoid flex-col gap-2 rounded-lg border bg-background p-4">
          <h3 className="text-sm font-semibold">
            Vencidas na data de corte ({attention.late.length})
          </h3>
          <RowList rows={attention.late} empty="Nenhuma atividade vencida." />
        </div>
        <div className="flex break-inside-avoid flex-col gap-2 rounded-lg border bg-background p-4">
          <h3 className="text-sm font-semibold">Em andamento ({attention.inProgress.length})</h3>
          <RowList rows={attention.inProgress} empty="Nenhuma tarefa em andamento." />
        </div>
        <div className="flex break-inside-avoid flex-col gap-2 rounded-lg border bg-background p-4">
          <h3 className="text-sm font-semibold">Próximas tarefas</h3>
          <RowList rows={attention.next} empty="Nenhuma tarefa a iniciar." />
        </div>
        <div className="flex break-inside-avoid flex-col gap-2 rounded-lg border bg-background p-4">
          <h3 className="text-sm font-semibold">Próximos marcos</h3>
          {attention.upcomingMilestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum marco pendente.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {attention.upcomingMilestones.map((milestone) => (
                <li key={milestone.id}>
                  {milestone.name} · {formatDate(milestone.date)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

function WbsTable({ rows }: { rows: ReportRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background print:overflow-visible">
      <table className="w-full min-w-[760px] text-left text-sm print:min-w-0 print:text-xs">
        <caption className="sr-only">
          Estrutura analítica completa, com todas as fases abertas
        </caption>
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              EAP
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Tarefa
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Responsável
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Início
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Término
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Duração
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Progresso
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Situação
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Predecessoras
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'break-inside-avoid border-b last:border-0',
                row.kind === 'summary' && 'bg-muted/50 font-medium',
              )}
            >
              <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{row.wbs}</td>
              <td className="px-3 py-1.5" style={{ paddingLeft: `${String(0.75 + row.depth)}rem` }}>
                {row.name}
                {row.kind === 'milestone' ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">(marco)</span>
                ) : null}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">{row.assignee ?? '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                {formatCellDate(isoDateToDay(row.start))}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                {formatCellDate(isoDateToDay(row.finish))}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatDuration(row.duration)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{row.progress}%</td>
              <td className="px-3 py-1.5">
                {row.state ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: STATE_FILLS[row.state] }}
                    />
                    {REPORT_STATE_LABELS[row.state]}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Fase</span>
                )}
              </td>
              <td className="px-3 py-1.5 font-mono text-xs">{row.predecessors || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

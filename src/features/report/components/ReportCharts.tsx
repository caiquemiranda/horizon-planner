import { formatDate } from '@/features/timeline/lib/format';
import { isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';

import { STATE_FILLS } from '../lib/colors';
import { type ProjectReport, REPORT_STATE_LABELS, REPORT_TASK_STATES } from '../lib/report';

/**
 * Report charts, drawn in SVG so they print like the rest of the page. Every chart is a
 * `figure` with a caption, direct labels (identity is never color alone) and the same
 * numbers in a table for assistive technology. Text uses the text colors; only the marks
 * are colored.
 */

function Figure({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="flex break-inside-avoid flex-col gap-3 rounded-lg border bg-background p-4">
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
      </figcaption>
      {children}
    </figure>
  );
}

function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[0])}>
            {row.map((cell, index) => (
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 1. Completion of each phase (top-level summary), from its leaf tasks. */
export function PhaseChart({ report }: { report: ProjectReport }) {
  const { phases } = report;
  const title = 'Conclusão por fase';
  const caption = 'Percentual de cada fase, pelas tarefas-folha dela (mesma regra do cronograma).';
  if (phases.length === 0) {
    return (
      <Figure title={title} caption={caption}>
        <p className="text-sm text-muted-foreground">Sem dados: o cronograma não tem fases.</p>
      </Figure>
    );
  }
  return (
    <Figure title={title} caption={caption}>
      <ul aria-hidden="true" className="flex flex-col gap-2">
        {phases.map((phase) => (
          <li
            key={phase.id}
            title={`${phase.wbs} ${phase.name}: ${String(phase.progress)}% (${String(phase.done)} de ${String(phase.total)} tarefas concluídas)`}
            className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate">
              <span className="font-mono text-xs text-muted-foreground">{phase.wbs}</span>{' '}
              {phase.name}
            </span>
            <span className="h-3 overflow-hidden rounded bg-muted">
              <span
                className="block h-full rounded"
                style={{
                  width: `${String(phase.progress)}%`,
                  minWidth: phase.progress > 0 ? '4px' : 0,
                  backgroundColor: 'var(--horizon-medium)',
                }}
              />
            </span>
            <span className="text-right text-xs tabular-nums">
              <strong className="font-semibold">{phase.progress}%</strong>{' '}
              <span className="text-muted-foreground">
                {phase.done}/{phase.total}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <DataTable
        caption={title}
        head={['Fase', 'Conclusão', 'Tarefas concluídas', 'Tarefas']}
        rows={phases.map((phase) => [
          `${phase.wbs} ${phase.name}`,
          `${String(phase.progress)}%`,
          phase.done,
          phase.total,
        ])}
      />
    </Figure>
  );
}

/** 2. Work tasks by state: disjoint categories adding up to the total. */
export function StateChart({ report }: { report: ProjectReport }) {
  const title = 'Tarefas por situação';
  const caption = `${String(report.workTasks)} tarefas (marcos não entram); cada tarefa em uma única situação.`;
  const states = REPORT_TASK_STATES.filter((state) => report.states[state] > 0);
  if (report.workTasks === 0) {
    return (
      <Figure title={title} caption={caption}>
        <p className="text-sm text-muted-foreground">Sem dados: o cronograma não tem tarefas.</p>
      </Figure>
    );
  }
  const width = 600;
  let x = 0;
  return (
    <Figure title={title} caption={caption}>
      <svg viewBox={`0 0 ${String(width)} 28`} className="w-full" role="img" aria-label={title}>
        {states.map((state) => {
          const count = report.states[state];
          const segment = (count / report.workTasks) * width;
          const start = x;
          x += segment;
          return (
            <rect
              key={state}
              x={start}
              y={0}
              // A 2px gap of surface between segments.
              width={Math.max(1, segment - 2)}
              height={28}
              rx={4}
              fill={STATE_FILLS[state]}
            >
              <title>{`${REPORT_STATE_LABELS[state]}: ${String(count)}`}</title>
            </rect>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {states.map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: STATE_FILLS[state] }}
            />
            {REPORT_STATE_LABELS[state]}
            <strong className="font-semibold tabular-nums">{report.states[state]}</strong>
          </li>
        ))}
      </ul>
    </Figure>
  );
}

interface DatePoint {
  label: string;
  date: ISODate;
  /** How the point is drawn: the plan, an estimate, a fact or the data date. */
  tone: 'plan' | 'estimate' | 'fact' | 'today';
}

const TONE_FILLS: Record<DatePoint['tone'], string> = {
  plan: 'var(--muted-foreground)',
  estimate: 'var(--horizon-medium)',
  fact: 'var(--report-done)',
  today: 'var(--today)',
};

/**
 * A time axis for a few dates (no fake series: each date is one point). The SVG only
 * places the points; their names and dates are text below it, so they never shrink.
 */
function DateAxis({ points, label }: { points: DatePoint[]; label: string }) {
  const days = points.map((point) => isoDateToDay(point.date));
  const min = Math.min(...days);
  const max = Math.max(...days);
  const span = Math.max(1, max - min);
  const width = 600;
  const pad = 10;
  const xOf = (date: ISODate) => pad + ((isoDateToDay(date) - min) / span) * (width - 2 * pad);
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${String(width)} 24`}
        className="w-full"
        role="img"
        aria-label={`${label}: ${sorted.map((point) => `${point.label} ${formatDate(point.date)}`).join('; ')}`}
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={12}
          y2={12}
          stroke="var(--border-strong)"
          strokeWidth={2}
        />
        {sorted.map((point) => (
          <circle
            key={point.label}
            cx={xOf(point.date)}
            cy={12}
            r={6}
            fill={TONE_FILLS[point.tone]}
            stroke="var(--background)"
            strokeWidth={2}
          >
            <title>{`${point.label}: ${formatDate(point.date)}`}</title>
          </circle>
        ))}
      </svg>
      <ol aria-hidden="true" className="flex flex-col gap-1 text-sm">
        {sorted.map((point) => (
          <li key={point.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: TONE_FILLS[point.tone] }}
            />
            <span className="min-w-0 flex-1 truncate">{point.label}</span>
            <span className="text-muted-foreground tabular-nums">{formatDate(point.date)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 3. Planned, forecast and actual dates, each its own point. */
export function DatesChart({ report }: { report: ProjectReport }) {
  const { dates } = report;
  const points: DatePoint[] = [
    { label: 'Início planejado', date: dates.plannedStart, tone: 'plan' },
    { label: 'Término planejado', date: dates.plannedFinish, tone: 'plan' },
  ];
  if (dates.baselineFinish) {
    points.push({ label: 'Linha de base', date: dates.baselineFinish, tone: 'plan' });
  }
  if (dates.forecastFinish) {
    points.push({ label: 'Previsão de término', date: dates.forecastFinish, tone: 'estimate' });
  }
  if (dates.actualFinish) {
    points.push({ label: 'Término real', date: dates.actualFinish, tone: 'fact' });
  }
  if (report.kind === 'progress')
    points.push({ label: 'Data de corte', date: report.asOf, tone: 'today' });
  const title = 'Planejado × previsto × realizado';
  return (
    <Figure
      title={title}
      caption="Cada data em seu ponto: o plano, a previsão calculada e o que de fato ocorreu."
    >
      <DateAxis points={points} label={title} />
      <DataTable
        caption={title}
        head={['Data', 'Dia']}
        rows={points.map((point) => [point.label, formatDate(point.date)])}
      />
    </Figure>
  );
}

/** 4. Milestones on the time axis, with their state. */
export function MilestonesChart({ report }: { report: ProjectReport }) {
  const title = 'Marcos';
  const { milestones } = report;
  if (milestones.length === 0) {
    return (
      <Figure title={title}>
        <p className="text-sm text-muted-foreground">Sem dados: o cronograma não tem marcos.</p>
      </Figure>
    );
  }
  const state = (milestone: (typeof milestones)[number]) =>
    milestone.done ? 'atingido' : milestone.overdue ? 'vencido' : 'pendente';
  return (
    <Figure
      title={title}
      caption={`${String(milestones.filter((milestone) => milestone.done).length)} de ${String(milestones.length)} atingidos.`}
    >
      <DateAxis
        label={title}
        points={milestones.map((milestone) => ({
          label: `${milestone.name} (${state(milestone)})`,
          date: milestone.date,
          tone: milestone.done ? 'fact' : milestone.overdue ? 'today' : 'plan',
        }))}
      />
      <DataTable
        caption={title}
        head={['Marco', 'Data', 'Situação']}
        rows={milestones.map((milestone) => [
          `${milestone.wbs} ${milestone.name}`,
          formatDate(milestone.date),
          state(milestone),
        ])}
      />
    </Figure>
  );
}

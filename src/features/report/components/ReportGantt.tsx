import { useId, useMemo } from 'react';

import { layoutConnectors } from '@/features/gantt/lib/connectorLayout';
import { GANTT_METRICS, getBarGeometry } from '@/features/gantt/lib/geometry';
import { COLOR_META } from '@/features/projects/constants';
import { buildTreeIndex, flattenVisibleRows, type TreeRow } from '@/features/schedule/lib/tree';
import { formatDate } from '@/features/timeline/lib/format';
import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate, Project } from '@/types/project';
import type { ProjectSchedule, ScheduleResult } from '@/types/schedule';
import type { Viewport } from '@/types/timeline';

import {
  type DayWindow,
  getGanttSpan,
  monthTicks,
  planGanttPages,
  type RowRange,
} from '../lib/ganttPages';

const ROW_HEIGHT = 26;
const LABEL_WIDTH = 300;
const CHART_WIDTH = 720;
const RULER_HEIGHT = 28;

/** Every task of the plan, phases expanded (the workspace's collapsed phases included). */
function useReportGanttRows(schedule: ProjectSchedule): TreeRow[] {
  return useMemo(() => {
    const index = buildTreeIndex(schedule.tasks);
    return flattenVisibleRows(index, {
      expandedIds: new Set(schedule.tasks.map((task) => task.id)),
    });
  }, [schedule.tasks]);
}

/**
 * The report's Gantt: every task of the plan (collapsed phases in the workspace are shown
 * expanded here), independent of the workspace's scroll and zoom. The same geometry and
 * connectors as the workspace chart, read-only.
 *
 * By default it shows the whole plan at once; `window` and `rowRange` draw one printed
 * page of it. Bars cut by the page edge are clipped and get an arrow on that edge, and
 * links whose other end is on another page are left to the WBS "Predecessoras" column.
 */
export function ReportGantt({
  project,
  schedule,
  result,
  today,
  window: dayWindow,
  rowRange,
  className,
}: {
  project: Project;
  schedule: ProjectSchedule;
  result: ScheduleResult;
  today: ISODate;
  window?: DayWindow;
  rowRange?: RowRange;
  className?: string;
}) {
  const allRows = useReportGanttRows(schedule);
  const clipId = `report-gantt-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (!result.range) return null;
  const { from, to } = dayWindow ?? getGanttSpan(result.range);
  const rows = rowRange ? allRows.slice(rowRange.start, rowRange.end) : allRows;
  const viewport: Viewport = {
    startDay: from,
    pxPerDay: CHART_WIDTH / (to - from),
    widthPx: CHART_WIDTH,
  };
  const connectors = layoutConnectors(schedule.dependencies, rows, result, viewport, ROW_HEIGHT);
  const todayDay = isoDateToDay(today);
  const height = RULER_HEIGHT + rows.length * ROW_HEIGHT;
  const color = `var(${COLOR_META[project.color].cssVar})`;
  const partial = dayWindow !== undefined || rowRange !== undefined;
  const ariaLabel = partial
    ? `Parte do gráfico de Gantt de ${project.title}: ${String(rows.length)} linhas.`
    : `Gráfico de Gantt de ${project.title}: ${String(rows.length)} linhas, a tabela da EAP traz os mesmos dados.`;

  return (
    <svg
      viewBox={`0 0 ${String(LABEL_WIDTH + CHART_WIDTH)} ${String(height)}`}
      className={className ?? 'w-full min-w-[720px]'}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={CHART_WIDTH} height={height} />
        </clipPath>
      </defs>
      {rows.map((row, index) =>
        index % 2 === 1 ? (
          <rect
            key={row.task.id}
            x={0}
            y={RULER_HEIGHT + index * ROW_HEIGHT}
            width={LABEL_WIDTH + CHART_WIDTH}
            height={ROW_HEIGHT}
            fill="var(--muted)"
            opacity={0.45}
          />
        ) : null,
      )}

      <g transform={`translate(${String(LABEL_WIDTH)} 0)`} clipPath={`url(#${clipId})`}>
        {monthTicks(from, to).map((tick) => {
          const x = (tick.day - from) * viewport.pxPerDay;
          return (
            <g key={tick.day}>
              <line x1={x} x2={x} y1={RULER_HEIGHT - 8} y2={height} stroke="var(--timeline-grid)" />
              <text x={x + 4} y={16} className="fill-muted-foreground text-[11px]">
                {tick.label}
              </text>
            </g>
          );
        })}
        {todayDay >= from && todayDay <= to ? (
          <g>
            <line
              x1={(todayDay - from) * viewport.pxPerDay}
              x2={(todayDay - from) * viewport.pxPerDay}
              y1={RULER_HEIGHT - 4}
              y2={height}
              stroke="var(--today)"
              strokeWidth={1.5}
            />
            <text
              x={(todayDay - from) * viewport.pxPerDay}
              y={RULER_HEIGHT - 6}
              textAnchor="middle"
              className="fill-today text-[10px] font-semibold"
            >
              Corte
            </text>
          </g>
        ) : null}

        <g transform={`translate(0 ${String(RULER_HEIGHT)})`}>
          {connectors.map((shape) => (
            <g key={shape.dependency.id} className="text-muted-foreground">
              <path
                d={shape.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                opacity={0.7}
              />
              <polygon points={shape.arrow} fill="currentColor" opacity={0.7} />
            </g>
          ))}
          {rows.map((row, index) => {
            const task = result.tasks.get(row.task.id);
            if (!task) return null;
            const bar = getBarGeometry(task, index, viewport, ROW_HEIGHT);
            const label = `${row.wbs} ${row.task.name}`;
            if (bar.kind === 'milestone') {
              const half = GANTT_METRICS.milestoneSize / 2;
              return (
                <polygon
                  key={row.task.id}
                  points={`${String(bar.x)},${String(bar.centerY - half)} ${String(bar.x + half)},${String(bar.centerY)} ${String(bar.x)},${String(bar.centerY + half)} ${String(bar.x - half)},${String(bar.centerY)}`}
                  fill={task.progress >= 100 ? 'var(--foreground)' : 'var(--background)'}
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                >
                  <title>{label}</title>
                </polygon>
              );
            }
            const continues = (
              <ContinuationMarks
                before={bar.x < 0}
                after={bar.x + bar.width > CHART_WIDTH}
                centerY={bar.centerY}
              />
            );
            if (bar.kind === 'summary') {
              return (
                <g key={row.task.id}>
                  <rect
                    x={bar.x}
                    y={bar.top}
                    width={bar.width}
                    height={bar.height}
                    rx={2}
                    fill="var(--foreground)"
                    opacity={0.75}
                  >
                    <title>{label}</title>
                  </rect>
                  {continues}
                </g>
              );
            }
            return (
              <g key={row.task.id}>
                <title>{`${label}: ${String(task.progress)}%`}</title>
                <rect
                  x={bar.x}
                  y={bar.top}
                  width={bar.width}
                  height={bar.height}
                  rx={4}
                  fill={color}
                  opacity={0.3}
                />
                <rect
                  x={bar.x}
                  y={bar.top}
                  width={(bar.width * Math.min(100, task.progress)) / 100}
                  height={bar.height}
                  rx={4}
                  fill={color}
                />
                {continues}
              </g>
            );
          })}
        </g>
      </g>

      <g transform={`translate(0 ${String(RULER_HEIGHT)})`}>
        {rows.map((row, index) => (
          <text
            key={row.task.id}
            x={8 + row.depth * 14}
            y={index * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}
            className={
              row.hasChildren
                ? 'fill-foreground text-[12px] font-semibold'
                : 'fill-foreground text-[12px]'
            }
          >
            <tspan className="fill-muted-foreground font-mono text-[10px]">{row.wbs} </tspan>
            {row.task.name.length > 34 ? `${row.task.name.slice(0, 33)}…` : row.task.name}
          </text>
        ))}
      </g>
      <line x1={LABEL_WIDTH} x2={LABEL_WIDTH} y1={0} y2={height} stroke="var(--border)" />
    </svg>
  );
}

/** Arrows on the page edge: the bar goes on in the previous or the next page. */
function ContinuationMarks({
  before,
  after,
  centerY,
}: {
  before: boolean;
  after: boolean;
  centerY: number;
}) {
  return (
    <>
      {before ? (
        <polygon
          data-continues="before"
          points={`1,${String(centerY)} 7,${String(centerY - 5)} 7,${String(centerY + 5)}`}
          fill="var(--foreground)"
        />
      ) : null}
      {after ? (
        <polygon
          data-continues="after"
          points={`${String(CHART_WIDTH - 1)},${String(centerY)} ${String(CHART_WIDTH - 7)},${String(centerY - 5)} ${String(CHART_WIDTH - 7)},${String(centerY + 5)}`}
          fill="var(--foreground)"
        />
      ) : null}
    </>
  );
}

/** What the marks mean; printed under every page of the chart. */
export function GanttLegend({ continued = false }: { continued?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-5 rounded-sm bg-foreground/30" />
        Tarefa (parte cheia: progresso)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-1.5 w-5 rounded-sm bg-foreground/75" />
        Fase
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rotate-45 bg-foreground" />
        Marco atingido (vazio: pendente)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-0.5 bg-today" />
        Corte: data dos dados
      </li>
      {continued ? (
        <li className="flex items-center gap-1.5">
          <svg aria-hidden="true" viewBox="0 0 22 10" className="h-2.5 w-5.5 fill-foreground">
            <polygon points="0,5 6,0 6,10" />
            <polygon points="22,5 16,0 16,10" />
          </svg>
          A barra continua na página anterior ou seguinte
        </li>
      ) : null}
    </ul>
  );
}

/**
 * The Gantt for paper: one figure per page of `planGanttPages`, each with its rows, its
 * dates and the legend. Shown only when printing (the screen keeps the whole chart).
 */
export function ReportGanttPages({
  project,
  schedule,
  result,
  today,
  className,
}: {
  project: Project;
  schedule: ProjectSchedule;
  result: ScheduleResult;
  today: ISODate;
  className?: string;
}) {
  const rowCount = useReportGanttRows(schedule).length;
  if (!result.range) return null;
  const pages = planGanttPages(getGanttSpan(result.range), rowCount);
  const split = pages.length > 1;

  return (
    <div className={className}>
      {pages.map((page, index) => (
        <figure
          key={`${String(page.rows.start)}-${String(page.window.from)}`}
          data-print-page=""
          className="flex break-inside-avoid flex-col gap-2"
        >
          {split ? (
            <figcaption className="text-xs text-muted-foreground">
              Parte {index + 1} de {pages.length} · linhas {page.rows.start + 1}–{page.rows.end} ·{' '}
              {formatDate(dayToIsoDate(page.window.from))} a{' '}
              {formatDate(dayToIsoDate(page.window.to - 1))}
            </figcaption>
          ) : null}
          <ReportGantt
            project={project}
            schedule={schedule}
            result={result}
            today={today}
            window={page.window}
            rowRange={page.rows}
            className="w-full"
          />
          <GanttLegend continued={split} />
        </figure>
      ))}
      {split ? (
        <p className="text-xs text-muted-foreground">
          Ligações entre tarefas de páginas diferentes não são desenhadas: estão na coluna
          Predecessoras da EAP.
        </p>
      ) : null}
    </div>
  );
}

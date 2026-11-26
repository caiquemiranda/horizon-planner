import { useMemo } from 'react';

import { layoutConnectors } from '@/features/gantt/lib/connectorLayout';
import { GANTT_METRICS, getBarGeometry } from '@/features/gantt/lib/geometry';
import { COLOR_META } from '@/features/projects/constants';
import { buildTreeIndex, flattenVisibleRows } from '@/features/schedule/lib/tree';
import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate, Project } from '@/types/project';
import type { ProjectSchedule, ScheduleResult } from '@/types/schedule';
import type { Viewport } from '@/types/timeline';

const ROW_HEIGHT = 26;
const LABEL_WIDTH = 300;
const CHART_WIDTH = 720;
const RULER_HEIGHT = 28;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** First day of every month that starts inside `[from, to]`, plus `from` itself. */
function monthTicks(from: number, to: number): { day: number; label: string }[] {
  const start = dayToIsoDate(from);
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7)) - 1;
  const ticks: { day: number; label: string }[] = [];
  for (;;) {
    const day = isoDateToDay(`${String(year)}-${String(month + 1).padStart(2, '0')}-01` as ISODate);
    if (day > to) break;
    if (day >= from) ticks.push({ day, label: `${MONTHS[month] ?? ''} ${String(year)}` });
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return ticks;
}

/**
 * The report's Gantt: every task of the plan (collapsed phases in the workspace are shown
 * expanded here), the whole date range at once, independent of the workspace's scroll and
 * zoom. The same geometry and connectors as the workspace chart, read-only.
 */
export function ReportGantt({
  project,
  schedule,
  result,
  today,
}: {
  project: Project;
  schedule: ProjectSchedule;
  result: ScheduleResult;
  today: ISODate;
}) {
  const rows = useMemo(() => {
    const index = buildTreeIndex(schedule.tasks);
    return flattenVisibleRows(index, {
      expandedIds: new Set(schedule.tasks.map((task) => task.id)),
    });
  }, [schedule.tasks]);

  if (!result.range) return null;
  const from = result.range.start - 2;
  const to = result.range.finish + 2;
  const viewport: Viewport = {
    startDay: from,
    pxPerDay: CHART_WIDTH / (to - from),
    widthPx: CHART_WIDTH,
  };
  const connectors = layoutConnectors(schedule.dependencies, rows, result, viewport, ROW_HEIGHT);
  const todayDay = isoDateToDay(today);
  const height = RULER_HEIGHT + rows.length * ROW_HEIGHT;
  const color = `var(${COLOR_META[project.color].cssVar})`;

  return (
    <svg
      viewBox={`0 0 ${String(LABEL_WIDTH + CHART_WIDTH)} ${String(height)}`}
      className="w-full min-w-[720px]"
      role="img"
      aria-label={`Gráfico de Gantt de ${project.title}: ${String(rows.length)} linhas, a tabela da EAP traz os mesmos dados.`}
    >
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

      <g transform={`translate(${String(LABEL_WIDTH)} 0)`}>
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
            if (bar.kind === 'summary') {
              return (
                <rect
                  key={row.task.id}
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

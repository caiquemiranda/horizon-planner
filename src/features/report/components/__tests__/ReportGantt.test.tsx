import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { getGanttSpan } from '../../lib/ganttPages';
import { ReportGantt, ReportGanttPages } from '../ReportGantt';

const project = makeProject({ title: 'Implantação SDAI', status: 'in_progress' });
const schedule = createIndustrialSchedule({
  projectId: project.id,
  start: '2027-01-04' as ISODate,
  generateId: (key) => `t-${key}`,
  now: new Date('2027-01-04T12:00:00.000Z'),
});
const result = computeSchedule(schedule);
const today = '2027-02-01' as ISODate;
if (!result.range) throw new Error('the fixture has a plan');
const span = getGanttSpan(result.range);

describe('ReportGantt', () => {
  it('draws the whole plan with no page edges by default', () => {
    const { container } = render(
      <ReportGantt project={project} schedule={schedule} result={result} today={today} />,
    );
    expect(
      screen.getByRole('img', { name: /^Gráfico de Gantt de Implantação SDAI: 14 linhas/ }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-continues]')).toBeNull();
  });

  it('draws one page: its rows only, with arrows where bars go on past the edge', () => {
    const middle = Math.round((span.from + span.to) / 2);
    const { container } = render(
      <ReportGantt
        project={project}
        schedule={schedule}
        result={result}
        today={today}
        window={{ from: span.from, to: middle }}
        rowRange={{ start: 0, end: 5 }}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Parte do gráfico de Gantt de Implantação SDAI: 5 linhas.' }),
    ).toBeInTheDocument();
    // The first phase spans the plan, so it is cut by the right edge of the first half.
    expect(container.querySelectorAll('[data-continues="after"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-continues="before"]')).toBeNull();
  });

  it('marks bars that started on the previous page', () => {
    const middle = Math.round((span.from + span.to) / 2);
    const { container } = render(
      <ReportGantt
        project={project}
        schedule={schedule}
        result={result}
        today={today}
        window={{ from: middle, to: span.to }}
      />,
    );
    expect(container.querySelectorAll('[data-continues="before"]').length).toBeGreaterThan(0);
  });
});

describe('ReportGanttPages', () => {
  it('prints a small plan as one page with its legend and no part numbers', () => {
    const { container } = render(
      <ReportGanttPages project={project} schedule={schedule} result={result} today={today} />,
    );
    expect(container.querySelectorAll('[data-print-page]')).toHaveLength(1);
    expect(screen.queryByText(/^Parte 1 de/)).not.toBeInTheDocument();
    expect(screen.getByText('Corte: data dos dados')).toBeInTheDocument();
  });

  it('cuts a long plan into numbered pages, each with its dates and the legend', () => {
    // Ten times longer: well past the six months that fit a page.
    const long = {
      ...schedule,
      tasks: schedule.tasks.map((task) => ({
        ...task,
        duration: task.duration * 10,
        completedWork: task.completedWork * 10,
      })),
    };
    const longResult = computeSchedule(long);
    const { container } = render(
      <ReportGanttPages project={project} schedule={long} result={longResult} today={today} />,
    );
    const pages = container.querySelectorAll('[data-print-page]');
    expect(pages.length).toBeGreaterThan(1);
    expect(
      screen.getByText(new RegExp(`^Parte 1 de ${String(pages.length)} · linhas 1–14 ·`)),
    ).toBeInTheDocument();
    expect(screen.getAllByText('A barra continua na página anterior ou seguinte')).toHaveLength(
      pages.length,
    );
    expect(screen.getByText(/coluna Predecessoras da EAP/)).toBeInTheDocument();
  });
});

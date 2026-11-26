import { describe, expect, it } from 'vitest';

import { createExamples } from '@/features/examples/lib/catalog';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { makeProject } from '@/test/factories';
import type { ISODate, Project } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { buildProjectReport, REPORT_TASK_STATES } from '../report';

const NOW = new Date('2026-11-26T12:00:00.000Z');

function industrial(today: ISODate, project: Partial<Project> = {}) {
  const base = makeProject({ status: 'in_progress', ...project });
  const schedule = createIndustrialSchedule({
    projectId: base.id,
    start: '2026-11-02' as ISODate,
    generateId: (key) => `t-${key}`,
    now: NOW,
  });
  return { project: base, schedule, today };
}

describe('buildProjectReport', () => {
  it('uses the schedule progress rule: leaves only, summaries never counted twice', () => {
    const input = industrial('2026-11-26' as ISODate);
    const report = buildProjectReport({ ...input, now: NOW });
    const result = computeSchedule(input.schedule);

    expect(report.kind).toBe('progress');
    expect(report.title).toBe('Relatório de andamento');
    expect(report.progress.percent).toBe(result.progress);
    expect(report.progress).toMatchObject({
      done: result.completion.done,
      total: result.completion.total,
    });
    expect(report.rows).toHaveLength(input.schedule.tasks.length);
    expect(
      report.rows.filter((row) => row.kind === 'summary').every((row) => row.state === null),
    ).toBe(true);
  });

  it('splits work tasks into disjoint states adding up to the total, milestones apart', () => {
    const report = buildProjectReport({ ...industrial('2026-11-26' as ISODate), now: NOW });
    const sum = REPORT_TASK_STATES.reduce((total, state) => total + report.states[state], 0);
    expect(sum).toBe(report.workTasks);
    expect(report.workTasks).toBe(9);
    expect(report.milestones).toHaveLength(1);
  });

  it('never calls future work late', () => {
    // Before the project starts, nothing can be late.
    const early = buildProjectReport({ ...industrial('2026-10-01' as ISODate), now: NOW });
    expect(early.states.late).toBe(0);
    expect(early.attention.late).toEqual([]);
    expect(early.highlights).toContain('Nenhuma atividade vencida na data de corte.');

    // Weeks later, unfinished work planned before the data date is late.
    const later = buildProjectReport({ ...industrial('2026-12-31' as ISODate), now: NOW });
    expect(later.states.late).toBeGreaterThan(0);
    for (const row of later.attention.late) expect(row.finish < '2026-12-31').toBe(true);
  });

  it('keeps planned, forecast and actual finish apart', () => {
    const running = buildProjectReport({ ...industrial('2026-11-26' as ISODate), now: NOW });
    expect(running.dates.plannedFinish).not.toBeNull();
    expect(running.dates.forecastFinish).not.toBeNull();
    expect(running.dates.actualFinish).toBeNull();

    const paused = buildProjectReport({
      ...industrial('2026-11-26' as ISODate, { status: 'paused' }),
      now: NOW,
    });
    expect(paused.dates.forecastFinish).toBeNull();
  });

  it('gives a final report for a closed project, where unfinished work is not done, not late', () => {
    const input = industrial('2026-12-31' as ISODate, {
      status: 'cancelled',
      lifecycle: {
        startedAt: '2026-11-02' as ISODate,
        completedAt: null,
        closedAt: '2026-12-10' as ISODate,
        closeReason: 'Cliente cancelou',
        postponement: null,
        history: [],
      },
    });
    const report = buildProjectReport({ ...input, now: NOW });
    expect(report.kind).toBe('final');
    expect(report.title).toBe('Relatório final');
    expect(report.states.late).toBe(0);
    expect(report.states.not_done).toBeGreaterThan(0);
    expect(report.dates.actualFinish).toBe('2026-12-10');
    expect(report.dates.forecastFinish).toBeNull();
  });

  it('reports the completed sample as finished on its real date', () => {
    const retrofit = createExamples('2026-11-26' as ISODate, NOW)[2];
    if (!retrofit) throw new Error('missing example');
    const report = buildProjectReport({ ...retrofit, today: '2026-11-26' as ISODate, now: NOW });
    expect(report.kind).toBe('final');
    expect(report.progress.percent).toBe(100);
    expect(report.dates.actualFinish).toBe(retrofit.project.endDate);
    expect(report.highlights).toContain('Todas as tarefas foram concluídas.');
  });

  it('works without a schedule, from the portfolio data', () => {
    const project = makeProject({ progress: 30, status: 'in_progress' });
    const report = buildProjectReport({
      project,
      schedule: null,
      today: '2026-11-26' as ISODate,
      now: NOW,
    });
    expect(report.hasSchedule).toBe(false);
    expect(report.progress.percent).toBe(30);
    expect(report.dates.plannedStart).toBe(project.startDate);
    expect(report.highlights).toEqual([]);
  });

  it('counts the daily check-ins and the phases of the plan', () => {
    const input = industrial('2026-11-26' as ISODate);
    const schedule: ProjectSchedule = {
      ...input.schedule,
      checkIns: [
        {
          id: 'c1',
          taskId: 't-A',
          workDate: '2026-11-02' as ISODate,
          state: 'done',
          units: 1,
          recordedAt: NOW.toISOString(),
        },
        {
          id: 'c2',
          taskId: 't-A',
          workDate: '2026-11-03' as ISODate,
          state: 'not_done',
          units: 0,
          recordedAt: NOW.toISOString(),
        },
      ],
    };
    const report = buildProjectReport({ ...input, schedule, now: NOW });
    expect(report.checkIns).toEqual({ done: 1, notDone: 1, last: '2026-11-03' });
    expect(report.phases.map((phase) => phase.name)).toEqual([
      'Engenharia',
      'Suprimentos',
      'Implantação',
      'Entrega',
    ]);
  });
});

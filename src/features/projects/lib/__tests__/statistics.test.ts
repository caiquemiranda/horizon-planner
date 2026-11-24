import { describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';
import type { ISODate, Project, ProjectStatus } from '@/types/project';

import { computeStatistics, getPeriodStart } from '../statistics';

const TODAY = '2026-11-23' as ISODate;
const AT = '2026-05-01T10:00:00.000Z';

function project(
  status: ProjectStatus,
  dates: { started?: string; completed?: string; closed?: string } = {},
  extra: Partial<Project> = {},
): Project {
  return makeProject({
    status,
    lifecycle: {
      startedAt: (dates.started ?? null) as ISODate | null,
      completedAt: (dates.completed ?? null) as ISODate | null,
      closedAt: (dates.closed ?? null) as ISODate | null,
      closeReason: null,
      postponement: null,
      history: [],
    },
    ...extra,
  });
}

describe('getPeriodStart', () => {
  it('gives the first day of each period', () => {
    expect(getPeriodStart('all', TODAY)).toBeNull();
    expect(getPeriodStart('year', TODAY)).toBe('2026-01-01');
    expect(getPeriodStart('30d', TODAY)).toBe('2026-10-25');
    expect(getPeriodStart('90d', TODAY)).toBe('2026-08-26');
  });
});

describe('computeStatistics', () => {
  const portfolio = [
    project('planned'),
    project('in_progress', { started: '2026-11-02' }, { progress: 40 }),
    project('in_progress', { started: '2025-06-01' }, { progress: 80 }),
    project('paused', { started: '2026-03-01' }),
    project('completed', { started: '2026-01-10', completed: '2026-11-20' }),
    project('completed', { started: '2025-01-10', completed: '2025-12-01' }),
    project('cancelled', { started: '2026-02-01', closed: '2026-10-01' }),
  ];

  it('counts every indicator for all time', () => {
    expect(computeStatistics(portfolio, 'all', TODAY)).toEqual({
      started: 6,
      completed: 2,
      notCompleted: 1,
      postponed: 1,
      inProgress: 2,
      planned: 1,
      completionRate: 67,
      averageProgress: 60,
      total: 7,
      inTrash: 0,
    });
  });

  it('filters started, completed and not completed by their own dates', () => {
    const year = computeStatistics(portfolio, 'year', TODAY);
    expect(year).toMatchObject({ started: 4, completed: 1, notCompleted: 1, completionRate: 50 });
    const month = computeStatistics(portfolio, '30d', TODAY);
    expect(month).toMatchObject({ started: 1, completed: 1, notCompleted: 0, completionRate: 100 });
    // Current states do not depend on the period.
    expect(month).toMatchObject({ inProgress: 2, postponed: 1, planned: 1 });
  });

  it('keeps a hidden completed project in the completed count', () => {
    const hidden = project('completed', { completed: '2026-11-01' }, { hiddenAt: AT });
    expect(computeStatistics([hidden], 'all', TODAY)).toMatchObject({ completed: 1, total: 1 });
  });

  it('leaves trashed projects out, counted apart, and back after restoring', () => {
    const done = project('completed', { completed: '2026-11-01' });
    const trashed = { ...done, deletedAt: AT };
    expect(computeStatistics([trashed], 'all', TODAY)).toMatchObject({
      completed: 0,
      total: 0,
      inTrash: 1,
    });
    expect(computeStatistics([{ ...trashed, deletedAt: null }], 'all', TODAY)).toMatchObject({
      completed: 1,
      inTrash: 0,
    });
  });

  it('has no rate or average without the projects they need', () => {
    expect(computeStatistics([project('planned')], 'all', TODAY)).toMatchObject({
      completionRate: null,
      averageProgress: null,
    });
    expect(computeStatistics([], 'all', TODAY).total).toBe(0);
  });

  it('ignores dates after today', () => {
    const future = project('in_progress', { started: '2026-12-01' });
    expect(computeStatistics([future], 'all', TODAY).started).toBe(0);
  });
});

import type { ISODate, Project } from '@/types/project';

/**
 * Portfolio statistics for "Meu painel". One rule per indicator, documented next to it,
 * so the numbers can be checked against the lists.
 *
 * Scope: every project that is not in the trash. Hidden projects count (hiding is a
 * display preference and does not erase history); trashed ones do not, and are counted
 * apart. The app has one local user, so "my" projects are all the projects stored here,
 * except the installed sample projects: their data is fictional and never counts.
 *
 * Indicators are not exclusive categories: a project started and completed in the
 * period counts in both. Never add them up.
 */

export const STATISTICS_PERIODS = ['all', 'year', '90d', '30d'] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];

export const PERIOD_LABELS: Record<StatisticsPeriod, string> = {
  all: 'Todo o período',
  year: 'Este ano',
  '90d': 'Últimos 90 dias',
  '30d': 'Últimos 30 dias',
};

export interface PortfolioStatistics {
  /** Projects with an actual start (`lifecycle.startedAt`) in the period. */
  started: number;
  /** Completed projects whose completion date is in the period. */
  completed: number;
  /** Projects closed without success whose closing date is in the period. */
  notCompleted: number;
  /** Now (not filtered by period): postponed projects. */
  postponed: number;
  /** Now: projects in progress. */
  inProgress: number;
  /** Now: planned, not started. */
  planned: number;
  /** completed / (completed + notCompleted) in the period; `null` without closed projects. */
  completionRate: number | null;
  /**
   * Now: plain average of the progress of projects in progress (each project weighs the
   * same, whatever its size); `null` when none is in progress.
   */
  averageProgress: number | null;
  /** Projects counted (not in the trash), hidden ones included. */
  total: number;
  /** Projects in the trash, outside every indicator. */
  inTrash: number;
}

/** First day included by a period, or `null` for all time. */
export function getPeriodStart(period: StatisticsPeriod, today: ISODate): ISODate | null {
  if (period === 'all') return null;
  if (period === 'year') return `${today.slice(0, 4)}-01-01` as ISODate;
  const days = period === '90d' ? 89 : 29;
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10) as ISODate;
}

export function computeStatistics(
  projects: readonly Project[],
  period: StatisticsPeriod,
  today: ISODate,
): PortfolioStatistics {
  const from = getPeriodStart(period, today);
  const inPeriod = (date: ISODate | null) =>
    date !== null && (from === null || date >= from) && date <= today;

  const own = projects.filter((project) => !project.demo);
  const counted = own.filter((project) => project.deletedAt === null);
  const inProgressProjects = counted.filter((project) => project.status === 'in_progress');

  const started = counted.filter((project) => inPeriod(project.lifecycle.startedAt)).length;
  const completed = counted.filter(
    (project) => project.status === 'completed' && inPeriod(project.lifecycle.completedAt),
  ).length;
  const notCompleted = counted.filter(
    (project) => project.status === 'cancelled' && inPeriod(project.lifecycle.closedAt),
  ).length;
  const closed = completed + notCompleted;

  return {
    started,
    completed,
    notCompleted,
    postponed: counted.filter((project) => project.status === 'paused').length,
    inProgress: inProgressProjects.length,
    planned: counted.filter((project) => project.status === 'planned').length,
    completionRate: closed === 0 ? null : Math.round((completed / closed) * 100),
    averageProgress:
      inProgressProjects.length === 0
        ? null
        : Math.round(
            inProgressProjects.reduce((sum, project) => sum + project.progress, 0) /
              inProgressProjects.length,
          ),
    total: counted.length,
    inTrash: own.length - counted.length,
  };
}

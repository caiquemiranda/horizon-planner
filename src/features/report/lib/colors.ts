import type { ReportTaskState } from './report';

/** Fill of each task state: status colors only where they mean a state. */
export const STATE_FILLS: Record<ReportTaskState, string> = {
  done: 'var(--report-done)',
  in_progress: 'var(--horizon-short)',
  late: 'var(--destructive)',
  not_started: 'var(--border-strong)',
  not_done: 'var(--subtle-foreground)',
};

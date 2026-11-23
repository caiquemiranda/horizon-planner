import { dayToIsoDate } from '@/features/timeline/lib/time';
import type { Project, ProjectPatch } from '@/types/project';
import type { ScheduleResult } from '@/types/schedule';

import { getDisplayFinish } from './engine';

/**
 * Keeps the portfolio coherent with the detailed plan: once a project has tasks, it acts
 * as the root summary of its schedule. Its dates span the tasks and its progress is the
 * schedule's task-based progress (see `progress.ts`).
 *
 * Portfolio milestones stay valid: the range is widened to include them, never cut.
 * Returns `null` when nothing changes or the schedule is empty (then the dates the user
 * typed in the portfolio are kept).
 */
export function getProjectSyncPatch(project: Project, result: ScheduleResult): ProjectPatch | null {
  if (!result.range) return null;

  // The last day of the latest task (a final milestone ends on its own day).
  let lastDay = result.range.start;
  for (const task of result.tasks.values()) lastDay = Math.max(lastDay, getDisplayFinish(task));
  let startDate = dayToIsoDate(result.range.start);
  let endDate = dayToIsoDate(lastDay);
  for (const milestone of project.milestones) {
    if (milestone.date < startDate) startDate = milestone.date;
    if (milestone.date > endDate) endDate = milestone.date;
  }

  const patch: ProjectPatch = {};
  if (startDate !== project.startDate) patch.startDate = startDate;
  if (endDate !== project.endDate) patch.endDate = endDate;
  if (result.progress !== project.progress) patch.progress = result.progress;
  return Object.keys(patch).length === 0 ? null : patch;
}

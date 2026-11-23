import type { UUID } from '@/types/project';

/**
 * Progress of summaries and of the whole project, from the work of their leaf tasks.
 *
 * Rule (see docs/implementation/horizon-extension-audit.md, decision 5):
 * - only **leaf** tasks are work; a summary is never counted, so a phase with two
 *   subtasks counts as two tasks, not three;
 * - every leaf task weighs the same: a task's duration is not its effort, so a long task
 *   does not outweigh several short ones;
 * - a leaf contributes its own completion (`progress / 100`); a task is done at 100%;
 * - **milestones** (duration 0) are checkpoints, not work: they count only when there is
 *   no other work below, e.g. a phase made of milestones alone;
 * - no eligible task gives 0% (never `NaN`);
 * - the result is a whole percentage; 100% only when every eligible task is done, so a
 *   project is never shown as finished while work remains.
 */

export interface LeafProgress {
  id: UUID;
  /** 0–100. */
  progress: number;
  isMilestone: boolean;
}

export interface ProgressSummary {
  /** Whole percentage, 0–100. */
  progress: number;
  /** Eligible leaf tasks (the denominator). */
  total: number;
  /** Eligible leaf tasks at 100%. */
  done: number;
}

export const EMPTY_PROGRESS: ProgressSummary = { progress: 0, total: 0, done: 0 };

/** Combines the leaves below one task (or the whole schedule) into one summary. */
export function summarizeProgress(leaves: readonly LeafProgress[]): ProgressSummary {
  const work = leaves.filter((leaf) => !leaf.isMilestone);
  const eligible = work.length > 0 ? work : leaves;
  if (eligible.length === 0) return EMPTY_PROGRESS;

  let sum = 0;
  let done = 0;
  for (const leaf of eligible) {
    const value = Math.min(100, Math.max(0, leaf.progress));
    sum += value;
    if (value >= 100) done += 1;
  }
  const average = sum / eligible.length;
  let progress = Math.round(average);
  // Rounding must not announce a finish (99.6 → 100) or hide started work (0.4 → 0).
  if (progress === 100 && done < eligible.length) progress = 99;
  if (progress === 0 && sum > 0) progress = 1;
  return { progress, total: eligible.length, done };
}

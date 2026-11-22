import type { ISODate, UUID } from '@/types/project';
import type {
  DependencyType,
  ProjectCalendar,
  ProjectSchedule,
  ScheduleTask,
  SchedulingMode,
  TaskDependency,
} from '@/types/schedule';

import {
  assertValidDependency,
  type DependencyCandidate,
  type GraphContext,
  type ParsedPredecessor,
} from './dependencies';
import { ScheduleRuleError } from './errors';
import {
  buildTreeIndex,
  copyTaskTree,
  getChildren,
  getWbsNumbers,
  indentTask as indentInTree,
  insertTask,
  moveTask as moveInTree,
  outdentTask as outdentInTree,
  removeTaskTree,
  shiftTask as shiftInTree,
} from './tree';

/**
 * Domain commands: every change to a schedule goes through here, whether it comes from
 * a table cell, a bar drag or a dialog. Each command validates the rules, never mutates
 * its input and either returns a new schedule or throws a `ScheduleRuleError` with a
 * pt-BR message (the original schedule stays untouched).
 *
 * `revision` and `updatedAt` are managed by persistence, not here.
 */

export const TASK_LIMITS = {
  nameMax: 200,
  assigneeMax: 80,
  notesMax: 5000,
  durationMax: 3650,
  tasksMax: 5000,
} as const;

export type IdGenerator = () => UUID;

function describeTask(schedule: ProjectSchedule) {
  const index = buildTreeIndex(schedule.tasks);
  const wbs = getWbsNumbers(index);
  return (id: UUID) => {
    const task = index.byId.get(id);
    return task ? `"${wbs.get(id) ?? ''} ${task.name}"` : 'A tarefa';
  };
}

function graphContext(schedule: ProjectSchedule): GraphContext {
  const index = buildTreeIndex(schedule.tasks);
  return {
    taskIds: new Set(schedule.tasks.map((task) => task.id)),
    summaryIds: new Set(
      schedule.tasks
        .filter((task) => getChildren(index, task.id).length > 0)
        .map((task) => task.id),
    ),
    dependencies: schedule.dependencies,
    describeTask: describeTask(schedule),
  };
}

function hasLinks(schedule: ProjectSchedule, id: UUID): boolean {
  return schedule.dependencies.some((link) => link.predecessorId === id || link.successorId === id);
}

/** A task with links cannot become a summary: its dates would stop being its own. */
function assertCanBecomeParent(schedule: ProjectSchedule, parentId: UUID | null) {
  if (parentId !== null && hasLinks(schedule, parentId)) {
    throw new ScheduleRuleError(
      'linked-task-cannot-be-summary',
      `${describeTask(schedule)(parentId)} tem vínculos e não pode receber subtarefas. Remova os vínculos dela primeiro.`,
    );
  }
}

function withTasks(schedule: ProjectSchedule, tasks: ScheduleTask[]): ProjectSchedule {
  return { ...schedule, tasks };
}

// ── Field validation ────────────────────────────────────────────────────────────────

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '')
    throw new ScheduleRuleError('invalid-field', 'O nome da tarefa é obrigatório.');
  if (trimmed.length > TASK_LIMITS.nameMax) {
    throw new ScheduleRuleError(
      'invalid-field',
      `O nome deve ter no máximo ${String(TASK_LIMITS.nameMax)} caracteres.`,
    );
  }
  return trimmed;
}

function checkDuration(duration: number): number {
  if (!Number.isInteger(duration) || duration < 0 || duration > TASK_LIMITS.durationMax) {
    throw new ScheduleRuleError(
      'invalid-field',
      `A duração deve ser um número inteiro de dias úteis entre 0 e ${String(TASK_LIMITS.durationMax)}.`,
    );
  }
  return duration;
}

function checkProgress(progress: number): number {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new ScheduleRuleError(
      'invalid-field',
      'O progresso deve ser um número inteiro entre 0 e 100.',
    );
  }
  return progress;
}

function checkDate(date: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ScheduleRuleError('invalid-field', 'Data inválida.');
  }
  return date as ISODate;
}

function cleanOptionalText(value: string | null, max: number, label: string): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ScheduleRuleError(
      'invalid-field',
      `${label} deve ter no máximo ${String(max)} caracteres.`,
    );
  }
  return trimmed === '' ? null : trimmed;
}

// ── Tasks ───────────────────────────────────────────────────────────────────────────

export interface TaskDraft {
  name: string;
  parentId: UUID | null;
  /** Position among the new siblings; end of the group by default. */
  position?: number;
  start: ISODate;
  duration: number;
  mode?: SchedulingMode;
  assignee?: string | null;
  progress?: number;
}

export function createTask(
  schedule: ProjectSchedule,
  draft: TaskDraft,
  generateId: IdGenerator,
): { schedule: ProjectSchedule; taskId: UUID } {
  if (schedule.tasks.length >= TASK_LIMITS.tasksMax) {
    throw new ScheduleRuleError(
      'limit-reached',
      `Um cronograma pode ter no máximo ${String(TASK_LIMITS.tasksMax)} tarefas.`,
    );
  }
  assertCanBecomeParent(schedule, draft.parentId);
  const task: ScheduleTask = {
    id: generateId(),
    parentId: draft.parentId,
    order: 0,
    name: cleanName(draft.name),
    assignee: cleanOptionalText(draft.assignee ?? null, TASK_LIMITS.assigneeMax, 'O responsável'),
    notes: '',
    mode: draft.mode ?? 'auto',
    start: checkDate(draft.start),
    duration: checkDuration(draft.duration),
    progress: checkProgress(draft.progress ?? 0),
  };
  return {
    schedule: withTasks(schedule, insertTask(schedule.tasks, task, draft.parentId, draft.position)),
    taskId: task.id,
  };
}

export type TaskPatch = Partial<
  Pick<ScheduleTask, 'name' | 'assignee' | 'notes' | 'mode' | 'start' | 'duration' | 'progress'>
>;

/** Fields derived from descendants that cannot be edited on a summary task. */
const SUMMARY_DERIVED_FIELDS = ['start', 'duration', 'progress', 'mode'] as const;

export function updateTask(schedule: ProjectSchedule, id: UUID, patch: TaskPatch): ProjectSchedule {
  const index = buildTreeIndex(schedule.tasks);
  const task = index.byId.get(id);
  if (!task) throw new ScheduleRuleError('task-not-found', 'A tarefa não existe mais.');

  const isSummary = getChildren(index, id).length > 0;
  if (isSummary && SUMMARY_DERIVED_FIELDS.some((field) => patch[field] !== undefined)) {
    throw new ScheduleRuleError(
      'summary-derived',
      'Datas, duração e progresso de uma tarefa resumo são calculados a partir das subtarefas.',
    );
  }

  const next: ScheduleTask = { ...task };
  if (patch.name !== undefined) next.name = cleanName(patch.name);
  if (patch.assignee !== undefined) {
    next.assignee = cleanOptionalText(patch.assignee, TASK_LIMITS.assigneeMax, 'O responsável');
  }
  if (patch.notes !== undefined) {
    next.notes = cleanOptionalText(patch.notes, TASK_LIMITS.notesMax, 'As notas') ?? '';
  }
  if (patch.mode !== undefined) next.mode = patch.mode;
  if (patch.start !== undefined) next.start = checkDate(patch.start);
  if (patch.duration !== undefined) next.duration = checkDuration(patch.duration);
  if (patch.progress !== undefined) next.progress = checkProgress(patch.progress);

  return withTasks(
    schedule,
    schedule.tasks.map((item) => (item.id === id ? next : item)),
  );
}

/**
 * Deletes a task, its descendants and every link that touches them (no orphans).
 * The UI confirms first, stating how many tasks and links go away.
 */
export function deleteTask(
  schedule: ProjectSchedule,
  id: UUID,
): { schedule: ProjectSchedule; removedTaskIds: Set<UUID>; removedDependencyIds: Set<UUID> } {
  const { tasks, removedIds } = removeTaskTree(schedule.tasks, id);
  const removedDependencyIds = new Set(
    schedule.dependencies
      .filter((link) => removedIds.has(link.predecessorId) || removedIds.has(link.successorId))
      .map((link) => link.id),
  );
  return {
    schedule: {
      ...schedule,
      tasks,
      dependencies: schedule.dependencies.filter((link) => !removedDependencyIds.has(link.id)),
    },
    removedTaskIds: removedIds,
    removedDependencyIds,
  };
}

/** Copies a task and its subtree right below it. Links are not copied (explicit policy). */
export function duplicateTask(
  schedule: ProjectSchedule,
  id: UUID,
  generateId: IdGenerator,
): { schedule: ProjectSchedule; taskId: UUID } {
  const { tasks, idMap } = copyTaskTree(schedule.tasks, id, generateId);
  if (tasks.length > TASK_LIMITS.tasksMax) {
    throw new ScheduleRuleError(
      'limit-reached',
      `Um cronograma pode ter no máximo ${String(TASK_LIMITS.tasksMax)} tarefas.`,
    );
  }
  return { schedule: withTasks(schedule, tasks), taskId: idMap.get(id) ?? id };
}

export function indentTask(schedule: ProjectSchedule, id: UUID): ProjectSchedule {
  const tasks = indentInTree(schedule.tasks, id);
  assertCanBecomeParent(schedule, tasks.find((task) => task.id === id)?.parentId ?? null);
  return withTasks(schedule, tasks);
}

export function outdentTask(schedule: ProjectSchedule, id: UUID): ProjectSchedule {
  return withTasks(schedule, outdentInTree(schedule.tasks, id));
}

export function shiftTask(schedule: ProjectSchedule, id: UUID, direction: -1 | 1): ProjectSchedule {
  return withTasks(schedule, shiftInTree(schedule.tasks, id, direction));
}

export function moveTask(
  schedule: ProjectSchedule,
  id: UUID,
  parentId: UUID | null,
  position: number,
): ProjectSchedule {
  assertCanBecomeParent(schedule, parentId);
  return withTasks(schedule, moveInTree(schedule.tasks, id, parentId, position));
}

// ── Dependencies ────────────────────────────────────────────────────────────────────

export function addDependency(
  schedule: ProjectSchedule,
  candidate: DependencyCandidate,
  generateId: IdGenerator,
): { schedule: ProjectSchedule; dependencyId: UUID } {
  assertValidDependency(candidate, graphContext(schedule));
  const link: TaskDependency = { id: generateId(), ...candidate };
  return {
    schedule: { ...schedule, dependencies: [...schedule.dependencies, link] },
    dependencyId: link.id,
  };
}

export function updateDependency(
  schedule: ProjectSchedule,
  id: UUID,
  patch: Partial<{ type: DependencyType; lag: number; predecessorId: UUID; successorId: UUID }>,
): ProjectSchedule {
  const link = schedule.dependencies.find((item) => item.id === id);
  if (!link) throw new ScheduleRuleError('task-not-found', 'O vínculo não existe mais.');
  const next = { ...link, ...patch };
  assertValidDependency(next, graphContext(schedule), id);
  return {
    ...schedule,
    dependencies: schedule.dependencies.map((item) => (item.id === id ? next : item)),
  };
}

export function removeDependency(schedule: ProjectSchedule, id: UUID): ProjectSchedule {
  if (!schedule.dependencies.some((link) => link.id === id)) {
    throw new ScheduleRuleError('task-not-found', 'O vínculo não existe mais.');
  }
  return { ...schedule, dependencies: schedule.dependencies.filter((link) => link.id !== id) };
}

/**
 * Replaces every predecessor of a task (the "Predecessoras" cell). Existing links keep
 * their ids when the same predecessor stays, so other references remain stable. All or
 * nothing: one invalid entry rejects the whole change.
 */
export function setPredecessors(
  schedule: ProjectSchedule,
  successorId: UUID,
  predecessors: readonly ParsedPredecessor[],
  generateId: IdGenerator,
): ProjectSchedule {
  const existing = schedule.dependencies.filter((link) => link.successorId === successorId);
  let next: ProjectSchedule = {
    ...schedule,
    dependencies: schedule.dependencies.filter((link) => link.successorId !== successorId),
  };
  for (const entry of predecessors) {
    const candidate = { ...entry, successorId };
    assertValidDependency(candidate, graphContext(next));
    const kept = existing.find((link) => link.predecessorId === entry.predecessorId);
    const link: TaskDependency = { id: kept?.id ?? generateId(), ...candidate };
    next = { ...next, dependencies: [...next.dependencies, link] };
  }
  return next;
}

// ── Calendar ────────────────────────────────────────────────────────────────────────

export function setCalendar(schedule: ProjectSchedule, calendar: ProjectCalendar): ProjectSchedule {
  const weekdays = [...new Set(calendar.workingWeekdays)].sort((a, b) => a - b);
  if (weekdays.length === 0) {
    throw new ScheduleRuleError('invalid-field', 'Escolha pelo menos um dia útil na semana.');
  }
  const seen = new Set<string>();
  const holidays = [...calendar.holidays]
    .map((holiday) => ({ date: checkDate(holiday.date), name: holiday.name.trim() || 'Feriado' }))
    .filter((holiday) => {
      if (seen.has(holiday.date)) return false;
      seen.add(holiday.date);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...schedule, calendar: { workingWeekdays: weekdays, holidays } };
}

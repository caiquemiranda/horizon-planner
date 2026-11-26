import { DEFAULT_HORIZON } from '@/features/projects/constants';
import { suggestHorizon } from '@/features/projects/lib/form';
import { createWorkCalendar } from '@/features/schedule/lib/calendar';
import { computeSchedule, getDisplayFinish } from '@/features/schedule/lib/engine';
import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { createId } from '@/lib/id';
import type { ISODate, Project, ProjectDraft, UUID } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import type { Example } from './catalog';

/**
 * "Criar projeto a partir deste exemplo": a new, real project with the sample's plan.
 *
 * Copied: the phases and tasks (names, notes, order, hierarchy), the durations, the links
 * and the calendar. Not copied: anything that happened in the sample, i.e. progress,
 * actual dates, check-ins, the baseline and the status, nor the fictional assignees.
 * Every id is new and the plan starts on the chosen date, then the engine schedules it.
 */

const SAMPLE_PREFIX = /^Exemplo com dados fictícios:\s*/;

export interface CloneOptions {
  title: string;
  /** First day of the new plan; snapped to the next working day. */
  start: ISODate;
  generateId?: () => UUID;
  now?: Date;
}

export interface ClonedExample {
  draft: ProjectDraft;
  /** Without a project id yet: the repository gives it when the project is created. */
  schedule: Omit<ProjectSchedule, 'projectId'>;
}

function withoutSamplePrefix(description: string): string {
  const text = description.replace(SAMPLE_PREFIX, '');
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

export function cloneExample(example: Example, options: CloneOptions): ClonedExample {
  const { title, start, generateId = createId, now = new Date() } = options;
  const { project, schedule } = example;
  const calendar = createWorkCalendar(schedule.calendar);
  const firstDay = calendar.nextWorkingDay(isoDateToDay(start));
  const sampleStart = Math.min(...schedule.tasks.map((task) => isoDateToDay(task.start)));
  const shift = firstDay - sampleStart;

  const ids = new Map(schedule.tasks.map((task) => [task.id, generateId()]));
  const newId = (id: UUID) => ids.get(id) ?? id;
  const tasks = schedule.tasks.map((task) => ({
    ...task,
    id: newId(task.id),
    parentId: task.parentId === null ? null : newId(task.parentId),
    assignee: null,
    // Auto tasks move with their links; manual ones keep their place in the plan.
    start: dayToIsoDate(isoDateToDay(task.start) + shift),
    progress: 0,
    completedWork: 0,
    actualStart: null,
    actualFinish: null,
  }));
  const cloned: Omit<ProjectSchedule, 'projectId'> = {
    revision: 0,
    calendar: structuredClone(schedule.calendar),
    tasks,
    dependencies: schedule.dependencies.map((dependency) => ({
      ...dependency,
      id: generateId(),
      predecessorId: newId(dependency.predecessorId),
      successorId: newId(dependency.successorId),
    })),
    checkIns: [],
    baseline: null,
    updatedAt: now.toISOString(),
  };

  const result = computeSchedule(cloned);
  let startDate = dayToIsoDate(firstDay);
  let endDate = startDate;
  if (result.range) {
    let lastDay = result.range.start;
    for (const task of result.tasks.values()) lastDay = Math.max(lastDay, getDisplayFinish(task));
    startDate = dayToIsoDate(result.range.start);
    endDate = dayToIsoDate(lastDay);
  }

  return {
    draft: {
      title: title.trim(),
      description: withoutSamplePrefix(project.description),
      horizon: suggestHorizon(startDate, endDate) ?? DEFAULT_HORIZON,
      category: project.category,
      status: 'planned',
      color: project.color,
      startDate,
      endDate,
      progress: 0,
      milestones: [],
    },
    schedule: cloned,
  };
}

export interface CreateFromExampleDependencies {
  createProject: (draft: ProjectDraft) => Promise<Project>;
  /** Saves a schedule that was never saved (`expectedRevision` 0). */
  saveSchedule: (schedule: ProjectSchedule) => Promise<ProjectSchedule>;
  /** Undoes `createProject` when the schedule cannot be saved. */
  removeProject: (id: UUID) => Promise<void>;
}

export class CreateFromExampleError extends Error {
  override readonly name = 'CreateFromExampleError';
}

/**
 * Writes the clone like an import: the project first (its repository gives the id), then
 * its schedule; when the schedule cannot be saved, the project is removed again.
 */
export async function createProjectFromExample(
  dependencies: CreateFromExampleDependencies,
  example: Example,
  options: CloneOptions,
): Promise<Project> {
  const { draft, schedule } = cloneExample(example, options);
  const project = await dependencies.createProject(draft);
  try {
    await dependencies.saveSchedule({ ...schedule, projectId: project.id });
  } catch (error) {
    try {
      await dependencies.removeProject(project.id);
    } catch (cleanup) {
      console.warn('[examples] Não foi possível desfazer o projeto criado.', cleanup);
    }
    throw new CreateFromExampleError(
      'Não foi possível gravar o cronograma do novo projeto. Nada foi criado.',
      { cause: error },
    );
  }
  return project;
}

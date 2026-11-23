import { dayToIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate, UUID } from '@/types/project';
import type { DependencyType, ProjectSchedule, ScheduleTask } from '@/types/schedule';

import { createWorkCalendar, DEFAULT_CALENDAR } from './calendar';
import { workFromProgress } from './checkIns';

/**
 * Deterministic demo schedule "Implantação de Sistema Industrial" (spec section 13).
 * Used by tests and by the user-triggered "Carregar dados de exemplo" action only; the
 * app never adds it on its own.
 *
 * Every phase is a summary task; A → … → H → Aceite final are chained finish-to-start,
 * and "Treinamento da equipe" runs in parallel without links.
 */

interface FixtureTask {
  key: string;
  name: string;
  parent?: string;
  duration?: number;
  progress?: number;
  assignee?: string;
}

const TASKS: FixtureTask[] = [
  { key: 'eng', name: 'Engenharia' },
  {
    key: 'A',
    parent: 'eng',
    name: 'Levantamento técnico',
    duration: 2,
    progress: 100,
    assignee: 'Engenharia',
  },
  {
    key: 'B',
    parent: 'eng',
    name: 'Desenvolvimento do projeto',
    duration: 3,
    progress: 60,
    assignee: 'Engenharia',
  },
  { key: 'C', parent: 'eng', name: 'Aprovação técnica', duration: 1, assignee: 'Coordenação' },
  { key: 'sup', name: 'Suprimentos' },
  {
    key: 'D',
    parent: 'sup',
    name: 'Especificação de materiais',
    duration: 2,
    assignee: 'Suprimentos',
  },
  { key: 'E', parent: 'sup', name: 'Aquisição', duration: 5, assignee: 'Compras' },
  { key: 'imp', name: 'Implantação' },
  { key: 'F', parent: 'imp', name: 'Instalação', duration: 4, assignee: 'Campo' },
  { key: 'G', parent: 'imp', name: 'Testes de campo', duration: 3, assignee: 'Qualidade' },
  { key: 'H', parent: 'imp', name: 'Comissionamento', duration: 2, assignee: 'Campo' },
  { key: 'T', parent: 'imp', name: 'Treinamento da equipe', duration: 3, assignee: 'RH' },
  { key: 'ent', name: 'Entrega' },
  { key: 'M', parent: 'ent', name: 'Aceite final', duration: 0, assignee: 'Cliente' },
];

const LINKS: [string, string, DependencyType][] = [
  ['A', 'B', 'FS'],
  ['B', 'C', 'FS'],
  ['C', 'D', 'FS'],
  ['D', 'E', 'FS'],
  ['E', 'F', 'FS'],
  ['F', 'G', 'FS'],
  ['G', 'H', 'FS'],
  ['H', 'M', 'FS'],
];

export interface FixtureOptions {
  projectId: UUID;
  /** First day of the project; snapped to the next working day. */
  start: ISODate;
  generateId: (key: string) => UUID;
  now?: Date;
}

export function createIndustrialSchedule({
  projectId,
  start,
  generateId,
  now = new Date(),
}: FixtureOptions): ProjectSchedule {
  const calendar = createWorkCalendar(DEFAULT_CALENDAR);
  const firstDay = dayToIsoDate(calendar.nextWorkingDay(isoDateToDay(start)));
  const ids = new Map(TASKS.map((task) => [task.key, generateId(task.key)]));
  const id = (key: string) => ids.get(key) ?? generateId(key);
  const orders = new Map<string, number>();

  const tasks: ScheduleTask[] = TASKS.map((task) => {
    const groupKey = task.parent ?? '';
    const order = orders.get(groupKey) ?? 0;
    orders.set(groupKey, order + 1);
    return {
      id: id(task.key),
      parentId: task.parent === undefined ? null : id(task.parent),
      order,
      name: task.name,
      assignee: task.assignee ?? null,
      notes: '',
      mode: 'auto',
      start: firstDay,
      duration: task.duration ?? 1,
      progress: task.progress ?? 0,
      completedWork: workFromProgress(task.progress ?? 0, task.duration ?? 1),
      actualStart: null,
      actualFinish: null,
    };
  });

  return {
    projectId,
    revision: 0,
    calendar: DEFAULT_CALENDAR,
    tasks,
    dependencies: LINKS.map(([predecessor, successor, type]) => ({
      id: generateId(`${predecessor}-${successor}`),
      predecessorId: id(predecessor),
      successorId: id(successor),
      type,
      lag: 0,
    })),
    checkIns: [],
    updatedAt: now.toISOString(),
  };
}

/** An empty schedule for a project that has never been planned. */
export function createEmptySchedule(projectId: UUID, now = new Date()): ProjectSchedule {
  return {
    projectId,
    revision: 0,
    calendar: DEFAULT_CALENDAR,
    tasks: [],
    dependencies: [],
    checkIns: [],
    updatedAt: now.toISOString(),
  };
}

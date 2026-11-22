import { describe, expect, it } from 'vitest';

import { dayToIsoDate } from '@/features/timeline/lib/time';
import { buildOutline, makeLink, taskId } from '@/test/schedule';
import type { ISODate } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { projectScheduleSchema } from '../../schemas';
import { DEFAULT_CALENDAR } from '../calendar';
import {
  addDependency,
  createTask,
  deleteTask,
  duplicateTask,
  indentTask,
  moveTask,
  removeDependency,
  setCalendar,
  setPredecessors,
  updateDependency,
  updateTask,
} from '../commands';
import { parsePredecessors } from '../dependencies';
import { computeSchedule, getDisplayFinish } from '../engine';
import { createEmptySchedule, createIndustrialSchedule } from '../fixtures';
import { buildTreeIndex, getWbsNumbers } from '../tree';

const NOW = new Date('2026-11-22T12:00:00Z');

function schedule(overrides: Partial<ProjectSchedule> = {}): ProjectSchedule {
  return {
    ...createEmptySchedule('project-1', NOW),
    tasks: buildOutline([{ key: 'Phase', children: [{ key: 'A' }, { key: 'B' }] }, { key: 'C' }]),
    ...overrides,
  };
}

function sequentialIds() {
  let next = 0;
  return () => `generated-${String(next++)}`;
}

describe('task commands', () => {
  it('creates the first task of an empty schedule', () => {
    const { schedule: next, taskId: id } = createTask(
      createEmptySchedule('project-1', NOW),
      { name: '  Levantamento  ', parentId: null, start: '2026-11-23' as ISODate, duration: 2 },
      sequentialIds(),
    );
    expect(next.tasks).toEqual([
      expect.objectContaining({ id, name: 'Levantamento', order: 0, mode: 'auto', progress: 0 }),
    ]);
  });

  it('creates a subtask in the expected place of a phase', () => {
    const { schedule: next, taskId: id } = createTask(
      schedule(),
      {
        name: 'Nova',
        parentId: taskId('Phase'),
        position: 1,
        start: '2026-11-23' as ISODate,
        duration: 1,
      },
      sequentialIds(),
    );
    expect(getWbsNumbers(buildTreeIndex(next.tasks)).get(id)).toBe('1.2');
  });

  it('validates fields with explicit messages and leaves the schedule untouched', () => {
    const original = schedule();
    const frozen = structuredClone(original);
    expect(() => updateTask(original, taskId('A'), { name: '  ' })).toThrow(
      'O nome da tarefa é obrigatório.',
    );
    expect(() => updateTask(original, taskId('A'), { duration: -1 })).toThrow(/duração/);
    expect(() => updateTask(original, taskId('A'), { duration: 1.5 })).toThrow(/duração/);
    expect(() => updateTask(original, taskId('A'), { progress: 101 })).toThrow(/progresso/);
    expect(() => updateTask(original, taskId('A'), { start: '2026-13-40' as ISODate })).toThrow(
      'Data inválida.',
    );
    expect(original).toEqual(frozen);
  });

  it('refuses to edit the derived fields of a summary task', () => {
    expect(() => updateTask(schedule(), taskId('Phase'), { duration: 3 })).toThrow(
      expect.objectContaining({ code: 'summary-derived' }),
    );
    expect(updateTask(schedule(), taskId('Phase'), { name: 'Fase 1' }).tasks[0]?.name).toBe(
      'Fase 1',
    );
  });

  it('turns a task into a milestone with a zero duration', () => {
    const next = updateTask(schedule(), taskId('C'), { duration: 0 });
    expect(computeSchedule(next).tasks.get(taskId('C'))?.kind).toBe('milestone');
  });

  it('deletes a phase with its subtasks and every link touching them', () => {
    const base = schedule({ dependencies: [makeLink('A', 'C'), makeLink('B', 'C')] });
    const {
      schedule: next,
      removedTaskIds,
      removedDependencyIds,
    } = deleteTask(base, taskId('Phase'));
    expect(removedTaskIds.size).toBe(3);
    expect(removedDependencyIds.size).toBe(2);
    expect(next.dependencies).toEqual([]);
    expect(next.tasks.map((task) => task.id)).toEqual([taskId('C')]);
  });

  it('duplicates a task without copying its links', () => {
    const base = schedule({ dependencies: [makeLink('A', 'C')] });
    const { schedule: next, taskId: copyId } = duplicateTask(base, taskId('A'), sequentialIds());
    expect(next.tasks.find((task) => task.id === copyId)?.name).toBe('A (cópia)');
    expect(next.dependencies).toEqual(base.dependencies);
  });

  it('refuses to give subtasks to a linked task', () => {
    const base = schedule({ dependencies: [makeLink('A', 'B')] });
    expect(() => indentTask(base, taskId('B'))).toThrow(
      expect.objectContaining({ code: 'linked-task-cannot-be-summary' }),
    );
    expect(() =>
      createTask(
        base,
        { name: 'X', parentId: taskId('A'), start: '2026-11-23' as ISODate, duration: 1 },
        sequentialIds(),
      ),
    ).toThrow(/tem vínculos/);
    expect(() => moveTask(base, taskId('C'), taskId('B'), 0)).toThrow(/tem vínculos/);
  });
});

describe('dependency commands', () => {
  it('adds, edits and removes a link', () => {
    const ids = sequentialIds();
    const added = addDependency(
      schedule(),
      { predecessorId: taskId('A'), successorId: taskId('B'), type: 'FS', lag: 0 },
      ids,
    );
    const edited = updateDependency(added.schedule, added.dependencyId, { type: 'SS', lag: 2 });
    expect(edited.dependencies).toEqual([
      expect.objectContaining({ id: added.dependencyId, type: 'SS', lag: 2 }),
    ]);
    expect(removeDependency(edited, added.dependencyId).dependencies).toEqual([]);
  });

  it('rejects a circular link and keeps the previous state', () => {
    const base = schedule({ dependencies: [makeLink('A', 'B'), makeLink('B', 'C')] });
    expect(() =>
      addDependency(
        base,
        { predecessorId: taskId('C'), successorId: taskId('A'), type: 'FS', lag: 0 },
        sequentialIds(),
      ),
    ).toThrow(expect.objectContaining({ code: 'dependency-cycle' }));
    expect(base.dependencies).toHaveLength(2);
  });

  it('replaces the predecessors of a task from the readable cell, keeping ids', () => {
    const base = schedule({ dependencies: [makeLink('A', 'C')] });
    const wbs = getWbsNumbers(buildTreeIndex(base.tasks));
    const idByWbs = new Map([...wbs].map(([id, number]) => [number, id]));

    const next = setPredecessors(
      base,
      taskId('C'),
      parsePredecessors('1.1; 1.2SS+1d', idByWbs),
      sequentialIds(),
    );
    expect(next.dependencies).toEqual([
      expect.objectContaining({ id: makeLink('A', 'C').id, type: 'FS' }),
      expect.objectContaining({
        id: 'generated-0',
        predecessorId: taskId('B'),
        type: 'SS',
        lag: 1,
      }),
    ]);
    expect(setPredecessors(next, taskId('C'), [], sequentialIds()).dependencies).toEqual([]);
  });

  it('rejects the whole cell when one entry is invalid', () => {
    const base = schedule({ dependencies: [makeLink('C', 'A')] });
    expect(() =>
      setPredecessors(
        base,
        taskId('C'),
        [
          { predecessorId: taskId('B'), type: 'FS', lag: 0 },
          { predecessorId: taskId('A'), type: 'FS', lag: 0 },
        ],
        sequentialIds(),
      ),
    ).toThrow(expect.objectContaining({ code: 'duplicate-dependency' }));
  });
});

describe('setCalendar', () => {
  it('normalizes weekdays and holidays', () => {
    const next = setCalendar(schedule(), {
      workingWeekdays: [5, 1, 1, 3],
      holidays: [
        { date: '2026-12-25' as ISODate, name: ' Natal ' },
        { date: '2026-11-20' as ISODate, name: '' },
        { date: '2026-12-25' as ISODate, name: 'Duplicado' },
      ],
    });
    expect(next.calendar).toEqual({
      workingWeekdays: [1, 3, 5],
      holidays: [
        { date: '2026-11-20', name: 'Feriado' },
        { date: '2026-12-25', name: 'Natal' },
      ],
    });
  });

  it('requires at least one working day', () => {
    expect(() => setCalendar(schedule(), { workingWeekdays: [], holidays: [] })).toThrow(
      /pelo menos um/,
    );
  });
});

describe('industrial demo schedule (spec 13)', () => {
  const demo = createIndustrialSchedule({
    projectId: 'project-1',
    start: '2026-11-23' as ISODate,
    generateId: (key) => `demo-${key}`,
    now: NOW,
  });

  it('is valid for persistence', () => {
    expect(projectScheduleSchema.safeParse(demo).success).toBe(true);
  });

  it('chains the phases and ends with the acceptance milestone', () => {
    const result = computeSchedule(demo);
    const acceptance = result.tasks.get('demo-M');
    expect(acceptance?.kind).toBe('milestone');
    // 2+3+1+2+5+4+3+2 = 22 working days from Monday 23/11/2026.
    expect(dayToIsoDate(acceptance?.start ?? 0)).toBe('2026-12-23');
    const training = result.tasks.get('demo-T');
    expect(dayToIsoDate(training?.start ?? 0)).toBe('2026-11-23');
    const phase = result.tasks.get('demo-eng');
    expect(phase?.kind).toBe('summary');
    expect(dayToIsoDate(getDisplayFinish(phase ?? { start: 0, finish: 0 }))).toBe('2026-11-30');
  });

  it('uses the default Monday to Friday calendar', () => {
    expect(demo.calendar).toEqual(DEFAULT_CALENDAR);
  });
});

describe('projectScheduleSchema', () => {
  it('rejects links to missing tasks and broken hierarchies', () => {
    const broken = {
      ...schedule({ dependencies: [{ ...makeLink('A', 'C'), successorId: 'ghost' }] }),
      tasks: [...schedule().tasks, { ...schedule().tasks[0], id: 'loop', parentId: 'loop' }],
    };
    const parsed = projectScheduleSchema.safeParse(broken);
    expect(parsed.success).toBe(false);
    const messages = parsed.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages).toContain('Vínculo com uma tarefa inexistente.');
    expect(messages.some((message) => message.includes('ciclo'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { projectSchema } from '@/features/projects/schemas';
import { getScheduleAccess } from '@/features/schedule/lib/access';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { projectScheduleSchema } from '@/features/schedule/schemas';
import type { ISODate } from '@/types/project';

import { createExamples, EXAMPLE_IDS } from '../catalog';
import { cloneExample } from '../clone';

const TODAY = '2026-11-26' as ISODate;
const NOW = new Date('2026-11-26T12:00:00.000Z');

function leafTasks(example: ReturnType<typeof createExamples>[number]) {
  const parents = new Set(example.schedule.tasks.map((task) => task.parentId));
  return example.schedule.tasks.filter((task) => !parents.has(task.id));
}

describe('examples catalog', () => {
  const examples = createExamples(TODAY, NOW);
  const [industrial, saas, retrofit] = examples;

  it('has three valid, flagged samples with fixed ids and their plans', () => {
    expect(examples.map((example) => example.project.id)).toEqual(Object.values(EXAMPLE_IDS));
    for (const { project, schedule } of examples) {
      expect(projectSchema.safeParse(project).success).toBe(true);
      expect(projectScheduleSchema.safeParse(schedule).success).toBe(true);
      expect(project.demo).toBe(true);
      expect(schedule.projectId).toBe(project.id);
      expect(computeSchedule(schedule).tasks.size).toBe(schedule.tasks.length);
      expect(getScheduleAccess(project).canEdit).toBe(false);
    }
  });

  it('gives the same samples for the same day', () => {
    expect(createExamples(TODAY, NOW)).toEqual(examples);
  });

  it('exercises the hierarchy, every supported link kind, milestones and progress', () => {
    if (!industrial || !saas || !retrofit) throw new Error('missing example');
    expect(leafTasks(industrial).length).toBeGreaterThanOrEqual(25);
    expect(new Set(industrial.schedule.dependencies.map((link) => link.type))).toEqual(
      new Set(['FS', 'SS', 'FF']),
    );
    expect(industrial.schedule.tasks.filter((task) => task.duration === 0).length).toBe(2);
    for (const result of [industrial, saas].map((example) => computeSchedule(example.schedule))) {
      expect(result.progress).toBeGreaterThan(0);
      expect(result.progress).toBeLessThan(100);
      expect(result.completion.done).toBeGreaterThan(0);
    }
    expect(industrial.project.status).toBe('in_progress');
    expect(saas.project.status).toBe('in_progress');
  });

  it('includes a finished project with every task done and its completion date', () => {
    if (!retrofit) throw new Error('missing example');
    const { project, schedule } = retrofit;
    expect(project.status).toBe('completed');
    expect(project.progress).toBe(100);
    expect(project.endDate < TODAY).toBe(true);
    expect(project.lifecycle.completedAt).toBe(project.endDate);
    for (const task of leafTasks(retrofit)) {
      expect(task.progress).toBe(100);
      expect(task.actualFinish).not.toBeNull();
    }
    expect(schedule.checkIns).toEqual([]);
  });
});

describe('cloneExample', () => {
  const [industrial] = createExamples(TODAY, NOW);
  let counter = 0;
  const generateId = () => {
    counter += 1;
    return `clone-${String(counter)}`;
  };

  it('copies the plan with new ids from the chosen start, without anything that happened', () => {
    if (!industrial) throw new Error('missing example');
    const { draft, schedule } = cloneExample(industrial, {
      title: '  SDAI na planta 2 ',
      start: '2027-02-01' as ISODate,
      generateId,
      now: NOW,
    });
    const sample = industrial.schedule;

    expect(draft).toMatchObject({
      title: 'SDAI na planta 2',
      status: 'planned',
      progress: 0,
      startDate: '2027-02-01',
      category: industrial.project.category,
    });
    expect(draft.description.startsWith('Sistema de detecção')).toBe(true);
    expect(draft.endDate > draft.startDate).toBe(true);

    const sampleIds = new Set(sample.tasks.map((task) => task.id));
    expect(schedule.tasks).toHaveLength(sample.tasks.length);
    expect(schedule.tasks.map((task) => task.name)).toEqual(sample.tasks.map((task) => task.name));
    expect(schedule.tasks.map((task) => task.duration)).toEqual(
      sample.tasks.map((task) => task.duration),
    );
    for (const task of schedule.tasks) {
      expect(sampleIds.has(task.id)).toBe(false);
      expect(task).toMatchObject({
        progress: 0,
        completedWork: 0,
        actualStart: null,
        actualFinish: null,
        assignee: null,
      });
    }
    const cloneIds = new Set(schedule.tasks.map((task) => task.id));
    expect(schedule.dependencies).toHaveLength(sample.dependencies.length);
    for (const link of schedule.dependencies) {
      expect(cloneIds.has(link.predecessorId) && cloneIds.has(link.successorId)).toBe(true);
    }
    expect(schedule.dependencies.map((link) => [link.type, link.lag])).toEqual(
      sample.dependencies.map((link) => [link.type, link.lag]),
    );
    expect(schedule.checkIns).toEqual([]);
    expect(schedule.baseline).toBeNull();
    expect(schedule.revision).toBe(0);
  });

  it('starts on the next working day when the chosen day is not one', () => {
    if (!industrial) throw new Error('missing example');
    // 2027-01-30 is a Saturday.
    const { draft } = cloneExample(industrial, {
      title: 'Cópia',
      start: '2027-01-30' as ISODate,
      generateId,
      now: NOW,
    });
    expect(draft.startDate).toBe('2027-02-01');
  });
});

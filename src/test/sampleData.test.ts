import { describe, expect, it } from 'vitest';

import { SNAPSHOT_SCHEMA_VERSION } from '@/features/projects/constants';
import { snapshotSchema } from '@/features/projects/schemas';
import { projectScheduleSchema } from '@/features/schedule/schemas';
import { createIdGenerator } from '@/services/persistence/__tests__/helpers';
import { HORIZONS, type ISODate } from '@/types/project';

import { createSampleData, createSampleProjects } from './sampleData';

const today = '2026-11-22' as ISODate;
const now = new Date('2026-11-22T12:00:00.000Z');

function build() {
  return createSampleProjects(today, { generateId: createIdGenerator(), now });
}

describe('createSampleProjects', () => {
  it('produces valid projects', () => {
    const result = snapshotSchema.safeParse({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      projects: build(),
    });

    expect(result.success).toBe(true);
  });

  it('covers every horizon, with work crossing today', () => {
    const projects = build();

    for (const horizon of HORIZONS) {
      expect(projects.some((project) => project.horizon === horizon)).toBe(true);
    }
    expect(projects.some((project) => project.startDate < today && project.endDate > today)).toBe(
      true,
    );
  });

  it('places dates relative to today', () => {
    const [kitchen] = build();

    expect(kitchen).toMatchObject({
      title: 'Reforma da cozinha',
      startDate: '2026-11-02',
      endDate: '2026-12-21',
    });
    expect(kitchen?.milestones.map((milestone) => milestone.date)).toEqual([
      '2026-11-07',
      '2026-12-07',
    ]);
  });

  it('numbers projects inside each lane', () => {
    const projects = build();

    for (const horizon of HORIZONS) {
      const orders = projects
        .filter((project) => project.horizon === horizon)
        .map((project) => project.sortOrder);
      expect(orders).toEqual(orders.map((_, index) => index));
    }
  });

  it('generates fresh ids on every call', () => {
    const first = createSampleProjects(today);
    const second = createSampleProjects(today);

    expect(first[0]?.id).not.toBe(second[0]?.id);
  });
});

describe('createSampleData', () => {
  it('adds a fully planned project whose dates come from its schedule', () => {
    const { projects, schedules } = createSampleData(today, {
      generateId: createIdGenerator(),
      now,
    });
    const industrial = projects.find(
      (project) => project.title === 'Implantação de Sistema Industrial',
    );

    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.projectId).toBe(industrial?.id);
    expect(projectScheduleSchema.safeParse(schedules[0]).success).toBe(true);
    // Starts 6 days before today, snapped to Monday 16/11/2026.
    expect(industrial).toMatchObject({ startDate: '2026-11-16', status: 'in_progress' });
    expect(industrial?.progress).toBeGreaterThan(0);
  });
});

import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';

import type { HorizonSnapshot, Project, ProjectDraft } from '@/types/project';
import { HORIZONS, PROJECT_COLORS, PROJECT_STATUSES } from '@/types/project';

import { COLOR_META, HORIZON_META, STATUS_META } from '../constants';
import {
  isoDateSchema,
  projectDraftSchema,
  type ProjectInput,
  projectSchema,
  snapshotSchema,
} from '../schemas';

const PROJECT_ID = '3f0c8a52-6a1e-4c55-9a0e-4b7f0d1c2e31';
const MILESTONE_ID = '9b2d6c1e-2f4a-4e8b-8d3c-7a1b5e6f4c20';
const OTHER_ID = 'c4e1f2a3-5b6c-4d7e-8f90-1a2b3c4d5e6f';

function makeProject(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    id: PROJECT_ID,
    title: 'Aprender piano',
    description: 'Estudar 30 minutos por dia.',
    horizon: 'medium',
    category: 'Pessoal',
    status: 'in_progress',
    color: 'violet',
    startDate: '2026-01-10',
    endDate: '2026-09-30',
    progress: 40,
    milestones: [
      { id: MILESTONE_ID, title: 'Primeira música', date: '2026-03-01', completed: true },
    ],
    sortOrder: 0,
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-01-10T12:00:00.000Z',
    ...overrides,
  };
}

/** Returns the issue paths of a failed parse, e.g. `['endDate']`. */
function issuePaths(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('type compatibility', () => {
  it('infers output types that match the domain model', () => {
    expectTypeOf<z.output<typeof projectSchema>>().toEqualTypeOf<Project>();
    expectTypeOf<z.output<typeof projectDraftSchema>>().toEqualTypeOf<ProjectDraft>();
    expectTypeOf<z.output<typeof snapshotSchema>>().toEqualTypeOf<HorizonSnapshot>();
  });
});

describe('isoDateSchema', () => {
  it.each(['2026-01-01', '2024-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(true);
  });

  it.each(['2026-13-01', '2026-02-30', '2025-02-29', '01/02/2026', '2026-1-1', ''])(
    'rejects %s',
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('projectSchema', () => {
  it('accepts a valid project', () => {
    expect(projectSchema.safeParse(makeProject()).success).toBe(true);
  });

  it('trims the title and rejects an empty one', () => {
    expect(projectSchema.parse(makeProject({ title: '  Piano  ' })).title).toBe('Piano');
    expect(issuePaths(projectSchema, makeProject({ title: '   ' }))).toEqual(['title']);
  });

  it('normalizes an empty category to null', () => {
    expect(projectSchema.parse(makeProject({ category: '  ' })).category).toBeNull();
    expect(projectSchema.parse(makeProject({ category: null })).category).toBeNull();
  });

  it.each([-1, 101, 50.5])('rejects progress %s', (progress) => {
    expect(issuePaths(projectSchema, makeProject({ progress }))).toEqual(['progress']);
  });

  it.each([0, 100])('accepts boundary progress %s', (progress) => {
    expect(projectSchema.safeParse(makeProject({ progress })).success).toBe(true);
  });

  it('rejects unknown enum values', () => {
    const input = { ...makeProject(), horizon: 'eternal', status: 'done', color: 'gold' };
    expect(issuePaths(projectSchema, input)).toEqual(['horizon', 'status', 'color']);
  });

  it('accepts a single-day project', () => {
    const input = makeProject({ startDate: '2026-05-05', endDate: '2026-05-05', milestones: [] });
    expect(projectSchema.safeParse(input).success).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const input = makeProject({ startDate: '2026-05-05', endDate: '2026-05-04', milestones: [] });
    expect(issuePaths(projectSchema, input)).toEqual(['endDate']);
  });

  it('accepts milestones on the range boundaries', () => {
    const input = makeProject({
      milestones: [
        { id: MILESTONE_ID, title: 'Início', date: '2026-01-10', completed: false },
        { id: OTHER_ID, title: 'Fim', date: '2026-09-30', completed: false },
      ],
    });
    expect(projectSchema.safeParse(input).success).toBe(true);
  });

  it('rejects milestones outside the project range', () => {
    const input = makeProject({
      milestones: [
        { id: MILESTONE_ID, title: 'Antes', date: '2026-01-09', completed: false },
        { id: OTHER_ID, title: 'Depois', date: '2026-10-01', completed: false },
      ],
    });
    expect(issuePaths(projectSchema, input)).toEqual(['milestones.0.date', 'milestones.1.date']);
  });

  it('rejects duplicated milestone ids', () => {
    const milestone = { id: MILESTONE_ID, title: 'Marco', date: '2026-03-01', completed: false };
    const input = makeProject({ milestones: [milestone, { ...milestone }] });
    expect(issuePaths(projectSchema, input)).toEqual(['milestones.1.id']);
  });

  it('rejects an invalid id', () => {
    expect(issuePaths(projectSchema, makeProject({ id: 'not-a-uuid' }))).toEqual(['id']);
  });
});

describe('projectDraftSchema', () => {
  it('does not require generated fields', () => {
    const { id: _id, sortOrder: _s, createdAt: _c, updatedAt: _u, ...draft } = makeProject();
    expect(projectDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('keeps the date invariants', () => {
    const {
      id: _id,
      sortOrder: _s,
      createdAt: _c,
      updatedAt: _u,
      ...draft
    } = makeProject({
      startDate: '2026-05-05',
      endDate: '2026-01-01',
      milestones: [],
    });
    expect(issuePaths(projectDraftSchema, draft)).toEqual(['endDate']);
  });
});

describe('snapshotSchema', () => {
  const snapshot = {
    schemaVersion: 1,
    exportedAt: '2026-11-21T18:00:00.000-03:00',
    projects: [makeProject()],
  };

  it('accepts a valid snapshot', () => {
    expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('accepts an empty project list', () => {
    expect(snapshotSchema.safeParse({ ...snapshot, projects: [] }).success).toBe(true);
  });

  it('rejects an unsupported schema version', () => {
    expect(issuePaths(snapshotSchema, { ...snapshot, schemaVersion: 2 })).toEqual([
      'schemaVersion',
    ]);
  });

  it('rejects duplicated project ids', () => {
    const input = { ...snapshot, projects: [makeProject(), makeProject()] };
    expect(issuePaths(snapshotSchema, input)).toEqual(['projects.1.id']);
  });

  it('reports nested project errors with their path', () => {
    const input = { ...snapshot, projects: [makeProject({ progress: 150 })] };
    expect(issuePaths(snapshotSchema, input)).toEqual(['projects.0.progress']);
  });
});

describe('domain constants', () => {
  it('describes every horizon, status and color', () => {
    expect(Object.keys(HORIZON_META)).toEqual([...HORIZONS]);
    expect(Object.keys(STATUS_META)).toEqual([...PROJECT_STATUSES]);
    expect(Object.keys(COLOR_META)).toEqual([...PROJECT_COLORS]);
  });
});

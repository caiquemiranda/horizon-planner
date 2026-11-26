import type { ISODate, Project } from '@/types/project';

let counter = 0;

/** A valid project with sequential ids; override only what the test cares about. */
export function makeProject(overrides: Partial<Project> = {}): Project {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    title: `Projeto ${String(counter)}`,
    description: '',
    horizon: 'short',
    category: null,
    status: 'planned',
    color: 'blue',
    startDate: '2026-03-02' as ISODate,
    endDate: '2026-03-20' as ISODate,
    progress: 0,
    milestones: [],
    lifecycle: {
      startedAt: null,
      completedAt: null,
      closedAt: null,
      closeReason: null,
      postponement: null,
      history: [],
    },
    hiddenAt: null,
    deletedAt: null,
    demo: false,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

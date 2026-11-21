import type { ISODate, ProjectDraft, UUID } from '@/types/project';

import type { RepositoryDependencies } from '../InMemoryRepository';

/** Deterministic clock: every call advances one minute from the given start. */
export function createClock(start = '2026-01-01T12:00:00.000Z'): () => Date {
  let current = new Date(start).getTime();
  return () => {
    const date = new Date(current);
    current += 60_000;
    return date;
  };
}

/** Deterministic, schema-valid v4 UUIDs: `00000000-0000-4000-8000-000000000001`, … */
export function createIdGenerator(): () => UUID {
  let counter = 0;
  return () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  };
}

export function createDependencies(): Required<RepositoryDependencies> {
  return { now: createClock(), generateId: createIdGenerator() };
}

export function makeDraft(overrides: Partial<ProjectDraft> = {}): ProjectDraft {
  return {
    title: 'Aprender piano',
    description: '',
    horizon: 'medium',
    category: null,
    status: 'planned',
    color: 'violet',
    startDate: '2026-01-10' as ISODate,
    endDate: '2026-09-30' as ISODate,
    progress: 0,
    milestones: [],
    ...overrides,
  };
}

/** Minimal in-memory `Storage` implementation with hooks to simulate failures. */
export class MemoryStorage implements Storage {
  [name: string]: unknown;

  private readonly items = new Map<string, string>();

  failOnGet: Error | null = null;
  failOnSet: Error | null = null;

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    if (this.failOnGet) throw this.failOnGet;
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failOnSet) throw this.failOnSet;
    this.items.set(key, value);
  }

  keys(): string[] {
    return Array.from(this.items.keys());
  }
}

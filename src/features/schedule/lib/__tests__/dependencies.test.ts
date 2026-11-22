import { describe, expect, it } from 'vitest';

import { makeLink, taskId } from '@/test/schedule';
import type { UUID } from '@/types/project';
import type { TaskDependency } from '@/types/schedule';

import {
  assertValidDependency,
  describeDependency,
  formatPredecessors,
  type GraphContext,
  isReachable,
  parsePredecessors,
  sortTopologically,
} from '../dependencies';

const ids = ['A', 'B', 'C', 'D', 'Phase'].map(taskId);

function context(dependencies: TaskDependency[]): GraphContext {
  return {
    taskIds: new Set(ids),
    summaryIds: new Set([taskId('Phase')]),
    dependencies,
    describeTask: (id: UUID) => id.replace('task-', ''),
  };
}

const link = (predecessor: string, successor: string) => ({
  predecessorId: taskId(predecessor),
  successorId: taskId(successor),
  type: 'FS' as const,
  lag: 0,
});

describe('assertValidDependency', () => {
  it('accepts a link between two leaf tasks', () => {
    expect(() => {
      assertValidDependency(link('A', 'B'), context([]));
    }).not.toThrow();
  });

  it('rejects self dependencies (A → A)', () => {
    expect(() => {
      assertValidDependency(link('A', 'A'), context([]));
    }).toThrow(expect.objectContaining({ code: 'self-dependency' }));
  });

  it('rejects cycles (A → B → C → A) without touching the graph', () => {
    const existing = [makeLink('A', 'B'), makeLink('B', 'C')];
    const before = structuredClone(existing);
    expect(() => {
      assertValidDependency(link('C', 'A'), context(existing));
    }).toThrow(/circular/);
    expect(() => {
      assertValidDependency(link('C', 'A'), context(existing));
    }).toThrow(expect.objectContaining({ code: 'dependency-cycle' }));
    expect(existing).toEqual(before);
  });

  it('rejects cycles for every link type', () => {
    const existing = [makeLink('A', 'B', 'SS')];
    expect(() => {
      assertValidDependency({ ...link('B', 'A'), type: 'FF' }, context(existing));
    }).toThrow(expect.objectContaining({ code: 'duplicate-dependency' }));
    const chain = [makeLink('A', 'B', 'SS'), makeLink('B', 'C', 'SF')];
    expect(() => {
      assertValidDependency({ ...link('C', 'A'), type: 'FF' }, context(chain));
    }).toThrow(expect.objectContaining({ code: 'dependency-cycle' }));
  });

  it('rejects duplicates, in either direction', () => {
    const existing = [makeLink('A', 'B')];
    expect(() => {
      assertValidDependency({ ...link('A', 'B'), type: 'SS' }, context(existing));
    }).toThrow(expect.objectContaining({ code: 'duplicate-dependency' }));
  });

  it('lets an existing link be edited without conflicting with itself', () => {
    const existing = [makeLink('A', 'B')];
    expect(() => {
      assertValidDependency(
        { ...link('A', 'B'), type: 'SS', lag: 2 },
        context(existing),
        existing[0]?.id,
      );
    }).not.toThrow();
  });

  it('rejects links to summary tasks and to missing tasks', () => {
    expect(() => {
      assertValidDependency(link('Phase', 'A'), context([]));
    }).toThrow(expect.objectContaining({ code: 'summary-dependency' }));
    expect(() => {
      assertValidDependency({ ...link('A', 'B'), successorId: 'ghost' }, context([]));
    }).toThrow(expect.objectContaining({ code: 'task-not-found' }));
  });

  it('rejects non-integer or out of range lags', () => {
    expect(() => {
      assertValidDependency({ ...link('A', 'B'), lag: 1.5 }, context([]));
    }).toThrow(/inteiro/);
    expect(() => {
      assertValidDependency({ ...link('A', 'B'), lag: 5000 }, context([]));
    }).toThrow(/inteiro/);
  });
});

describe('isReachable', () => {
  it('follows links forward only', () => {
    const graph = [makeLink('A', 'B'), makeLink('B', 'C')];
    expect(isReachable(graph, taskId('A'), taskId('C'))).toBe(true);
    expect(isReachable(graph, taskId('C'), taskId('A'))).toBe(false);
  });
});

describe('sortTopologically', () => {
  it('puts predecessors first and breaks ties by the given order', () => {
    const order = ['A', 'B', 'C', 'D'].map(taskId);
    // D → A, C → B: D must come before A, C before B.
    const result = sortTopologically(order, [makeLink('D', 'A'), makeLink('C', 'B')]);
    expect(result.order).toEqual(['C', 'B', 'D', 'A'].map(taskId));
    expect(result.cyclicIds.size).toBe(0);
  });

  it('is independent from the order links are stored in', () => {
    const order = ['A', 'B', 'C', 'D'].map(taskId);
    const links = [makeLink('A', 'C'), makeLink('B', 'C'), makeLink('C', 'D')];
    expect(sortTopologically(order, links).order).toEqual(
      sortTopologically(order, [...links].reverse()).order,
    );
  });

  it('reports cycles in corrupted data instead of looping', () => {
    const order = ['A', 'B', 'C'].map(taskId);
    const result = sortTopologically(order, [makeLink('A', 'B'), makeLink('B', 'A')]);
    expect(result.cyclicIds).toEqual(new Set([taskId('A'), taskId('B')]));
    expect(result.order).toHaveLength(3);
  });
});

describe('readable predecessors', () => {
  const wbs = new Map([
    [taskId('A'), '1.1'],
    [taskId('B'), '1.2'],
    [taskId('C'), '2'],
  ]);
  const idByWbs = new Map([...wbs].map(([id, number]) => [number, id]));

  it('formats links by WBS number, type and lag', () => {
    const links = [makeLink('B', 'C', 'SS', 2), makeLink('A', 'C'), makeLink('A', 'B', 'FF', -1)];
    expect(formatPredecessors(taskId('C'), links, wbs)).toBe('1.1; 1.2SS+2d');
    expect(formatPredecessors(taskId('B'), links, wbs)).toBe('1.1FF-1d');
    expect(formatPredecessors(taskId('A'), links, wbs)).toBe('');
  });

  it('parses English and Portuguese types, lags and separators', () => {
    expect(parsePredecessors('1.1; 1.2ss+2d', idByWbs)).toEqual([
      { predecessorId: taskId('A'), type: 'FS', lag: 0 },
      { predecessorId: taskId('B'), type: 'SS', lag: 2 },
    ]);
    expect(parsePredecessors('1.2TT-1 dia, 2IT', idByWbs)).toEqual([
      { predecessorId: taskId('B'), type: 'FF', lag: -1 },
      { predecessorId: taskId('C'), type: 'SF', lag: 0 },
    ]);
    expect(parsePredecessors('  ', idByWbs)).toEqual([]);
  });

  it('explains invalid entries', () => {
    expect(() => parsePredecessors('9', idByWbs)).toThrow('Não existe tarefa com EAP 9.');
    expect(() => parsePredecessors('1.1XY', idByWbs)).toThrow(/desconhecido/);
    expect(() => parsePredecessors('abc', idByWbs)).toThrow(/não é um vínculo válido/);
    expect(() => parsePredecessors('1.1; 1.1SS', idByWbs)).toThrow(/mais de uma vez/);
  });

  it('describes a link in words', () => {
    expect(describeDependency({ ...link('A', 'B'), lag: 2 }, (id) => id.replace('task-', ''))).toBe(
      'Término-início: A → B (a sucessora começa depois que a predecessora termina, com 2 dias úteis de atraso)',
    );
  });
});

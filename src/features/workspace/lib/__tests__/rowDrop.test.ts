import { describe, expect, it } from 'vitest';

import { buildTreeIndex, getWbsNumbers, moveTask } from '@/features/schedule/lib/tree';
import { buildOutline, taskId } from '@/test/schedule';

import { getDropMove, getDropZone } from '../rowDrop';

const tasks = () =>
  buildOutline([
    { key: 'Phase', children: [{ key: 'A' }, { key: 'B' }, { key: 'C' }] },
    { key: 'D' },
  ]);

function dropAndNumber(dragged: string, target: string, zone: 'before' | 'after' | 'inside') {
  const list = tasks();
  const move = getDropMove(buildTreeIndex(list), taskId(dragged), { rowId: taskId(target), zone });
  if (!move) return null;
  const moved = moveTask(list, taskId(dragged), move.parentId, move.position);
  return getWbsNumbers(buildTreeIndex(moved)).get(taskId(dragged));
}

describe('row drops', () => {
  it('maps the pointer height to a zone', () => {
    expect(getDropZone(0.1)).toBe('before');
    expect(getDropZone(0.5)).toBe('inside');
    expect(getDropZone(0.9)).toBe('after');
  });

  it('reorders among siblings, both directions', () => {
    expect(dropAndNumber('C', 'A', 'before')).toBe('1.1');
    expect(dropAndNumber('A', 'C', 'after')).toBe('1.3');
    expect(dropAndNumber('A', 'C', 'before')).toBe('1.2');
  });

  it('moves to another parent before or after a task', () => {
    expect(dropAndNumber('D', 'B', 'after')).toBe('1.3');
    expect(dropAndNumber('B', 'D', 'before')).toBe('2');
  });

  it('nests inside the target as its last subtask', () => {
    expect(dropAndNumber('D', 'Phase', 'inside')).toBe('1.4');
    expect(dropAndNumber('A', 'D', 'inside')).toBe('2.1');
  });

  it('ignores drops that change nothing', () => {
    expect(dropAndNumber('A', 'A', 'inside')).toBeNull();
    expect(dropAndNumber('A', 'B', 'before')).toBeNull();
    expect(dropAndNumber('B', 'A', 'after')).toBeNull();
    expect(dropAndNumber('A', 'Phase', 'inside')).toBeNull();
  });
});

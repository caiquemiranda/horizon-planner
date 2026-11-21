import { describe, expect, it } from 'vitest';

import { cn } from '../utils';

describe('cn', () => {
  it('joins conditional class names', () => {
    expect(cn('a', { b: false, c: true }, undefined, null)).toBe('a c');
  });

  it('resolves conflicting tailwind utilities, keeping the last one', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});

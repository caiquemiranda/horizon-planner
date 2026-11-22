import { describe, expect, it } from 'vitest';

import { isEditableTarget } from '../keyboard';

describe('isEditableTarget', () => {
  it('detects text fields', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

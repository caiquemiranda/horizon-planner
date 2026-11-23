import { describe, expect, it } from 'vitest';

import { holdEscape, isEditingText, isEscapeHeld } from '../escapeGuard';

describe('escapeGuard', () => {
  it('is held while at least one gesture holds it, and releases once', () => {
    expect(isEscapeHeld()).toBe(false);
    const releaseA = holdEscape();
    const releaseB = holdEscape();
    releaseA();
    releaseA();
    expect(isEscapeHeld()).toBe(true);
    releaseB();
    expect(isEscapeHeld()).toBe(false);
  });

  it('recognizes text fields', () => {
    expect(isEditingText(document.createElement('input'))).toBe(true);
    expect(isEditingText(document.createElement('textarea'))).toBe(true);
    expect(isEditingText(document.createElement('button'))).toBe(false);
    expect(isEditingText(null)).toBe(false);
  });
});

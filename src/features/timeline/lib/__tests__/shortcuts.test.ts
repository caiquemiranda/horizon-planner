import { describe, expect, it } from 'vitest';

import { isEditableTarget, resolveShortcut, type ShortcutInput } from '../shortcuts';

function press(key: string, overrides: Partial<ShortcutInput> = {}): ShortcutInput {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isEditing: false,
    ...overrides,
  };
}

describe('resolveShortcut', () => {
  it.each([
    ['+', { type: 'zoom-in' }],
    ['=', { type: 'zoom-in' }],
    ['-', { type: 'zoom-out' }],
    ['t', { type: 'today' }],
    ['T', { type: 'today' }],
    ['f', { type: 'fit' }],
    ['?', { type: 'help' }],
    ['1', { type: 'preset', presetId: 'years' }],
    ['5', { type: 'preset', presetId: 'days' }],
  ])('%s → %o', (key, action) => {
    expect(resolveShortcut(press(key))).toEqual(action);
  });

  it('pans a step with arrows and a page with Shift + arrows', () => {
    expect(resolveShortcut(press('ArrowRight'))).toEqual({ type: 'pan', widthFraction: 0.2 });
    expect(resolveShortcut(press('ArrowLeft', { shiftKey: true }))).toEqual({
      type: 'pan',
      widthFraction: -0.8,
    });
  });

  it('ignores unknown keys and presets out of range', () => {
    expect(resolveShortcut(press('x'))).toBeNull();
    expect(resolveShortcut(press('6'))).toBeNull();
    expect(resolveShortcut(press('0'))).toBeNull();
  });

  it('leaves browser and text field shortcuts alone', () => {
    expect(resolveShortcut(press('+', { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(press('t', { metaKey: true }))).toBeNull();
    expect(resolveShortcut(press('f', { altKey: true }))).toBeNull();
    expect(resolveShortcut(press('t', { isEditing: true }))).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('detects text fields', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyTheme,
  DEFAULT_THEME,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  THEME_STORAGE_KEY,
} from '../theme';

function createStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    items,
  };
}

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('readStoredTheme', () => {
  it('defaults to dark', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(readStoredTheme(createStorage())).toBe('dark');
    expect(readStoredTheme(undefined)).toBe('dark');
  });

  it('returns a valid stored preference', () => {
    expect(readStoredTheme(createStorage({ [THEME_STORAGE_KEY]: 'system' }))).toBe('system');
  });

  it('ignores invalid values and blocked storage', () => {
    expect(readStoredTheme(createStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('dark');
    expect(readStoredTheme(throwingStorage)).toBe('dark');
  });
});

describe('storeTheme', () => {
  it('saves the preference', () => {
    const storage = createStorage();
    storeTheme(storage, 'light');
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('swallows storage errors', () => {
    expect(() => {
      storeTheme(throwingStorage, 'light');
    }).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it.each([
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
  ] as const)('%s with system dark = %s → %s', (preference, prefersDark, expected) => {
    expect(resolveTheme(preference, prefersDark)).toBe(expected);
  });
});

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.className = '';
    document.head.innerHTML = '';
  });

  it('toggles the dark class, color scheme and theme-color meta', () => {
    document.head.innerHTML = '<meta name="theme-color" content="" />';
    const root = document.documentElement;

    applyTheme('dark', root);
    expect(root).toHaveClass('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#09090b',
    );

    applyTheme('light', root);
    expect(root).not.toHaveClass('dark');
    expect(root.style.colorScheme).toBe('light');
  });
});

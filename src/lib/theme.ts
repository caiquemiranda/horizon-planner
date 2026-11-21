/**
 * Theme preference logic, framework-agnostic.
 *
 * ⚠️ The inline script in `index.html` duplicates `readStoredTheme` + `resolveTheme`
 * to apply the theme before React loads (no flash). Keep both in sync.
 */

export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'horizon-planner:theme';
export const DEFAULT_THEME: ThemePreference = 'dark';

/** Browser `theme-color` per resolved theme (matches `--background`). */
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#09090b',
  light: '#fcfcfc',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** Reads the saved preference, falling back to the default on missing, invalid or blocked storage. */
export function readStoredTheme(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Saves the preference. Failures are ignored: the theme still applies for this session. */
export function storeTheme(storage: Pick<Storage, 'setItem'> | undefined, theme: ThemePreference) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be full or blocked (private mode); nothing else to do.
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/** Applies the resolved theme to the document root and the browser UI color. */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement) {
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  root.ownerDocument
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme]);
}

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

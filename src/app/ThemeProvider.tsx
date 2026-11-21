import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import {
  applyTheme,
  DARK_MEDIA_QUERY,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type ThemePreference,
} from '@/lib/theme';

import { ThemeContext, type ThemeContextValue } from './theme-context';

function getStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredTheme(getStorage()),
  );
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  // Follow OS changes; only affects the result when the preference is "system".
  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  const resolvedTheme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    storeTheme(getStorage(), next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

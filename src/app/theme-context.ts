import { createContext, useContext } from 'react';

import type { ResolvedTheme, ThemePreference } from '@/lib/theme';

export interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is actually applied (system preference resolved). */
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return context;
}

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';

import { ThemeProvider } from './ThemeProvider';

/** App-wide providers. Order matters: outer providers are available to inner ones. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {/* Motion animations follow the system "reduce motion" setting. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}

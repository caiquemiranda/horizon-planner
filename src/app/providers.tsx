import type { ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';

/** App-wide providers. Order matters: outer providers are available to inner ones. */
export function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={300}>{children}</TooltipProvider>;
}

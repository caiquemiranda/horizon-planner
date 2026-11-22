import type * as React from 'react';

import { cn } from '@/lib/utils';

/** A keyboard key, e.g. in shortcut hints. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground shadow-[0_1px_0_var(--border)]',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };

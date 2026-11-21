import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/Logo';
import { Separator } from '@/components/ui/separator';

interface AppHeaderProps {
  /** Center area, e.g. filters and zoom controls. */
  children?: ReactNode;
  /** Right-aligned actions, e.g. data menu and theme toggle. */
  actions?: ReactNode;
}

export function AppHeader({ children, actions }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-3 border-b glass px-4">
      <div className="flex items-center gap-2.5">
        <Logo className="size-7" />
        <h1 className="text-[15px] font-semibold">Horizon</h1>
        <span className="rounded-full border px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          v{__APP_VERSION__}
        </span>
      </div>

      {children ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-5!" />
          <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
        </>
      ) : (
        <div className="flex-1" />
      )}

      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}

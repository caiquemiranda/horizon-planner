import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/Logo';
import { Separator } from '@/components/ui/separator';

interface AppHeaderProps {
  /** Center area, e.g. filters and zoom controls. */
  children?: ReactNode;
  /** Right-aligned actions, e.g. data menu and theme toggle. */
  actions?: ReactNode;
  /** Before the logo, e.g. the menu button on phones. */
  leading?: ReactNode;
}

export function AppHeader({ children, actions, leading }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-3 border-b glass px-3 sm:px-4">
      {leading}
      <div className="flex items-center gap-2">
        <Logo className="size-6" />
        <h1 className="sr-only text-[15px] font-semibold sm:not-sr-only">Horizon</h1>
        <span className="hidden rounded-sm bg-muted px-1 py-px font-mono text-[10px] text-subtle-foreground sm:inline">
          v{__APP_VERSION__}
        </span>
      </div>

      {children ? (
        <>
          <Separator orientation="vertical" className="mx-1 hidden h-4! sm:block" />
          {/*
           * On narrow screens the toolbar scrolls sideways instead of overlapping the actions.
           * The padding keeps focus rings from being clipped by the scroll container.
           */}
          <div className="-m-1 no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto p-1">
            {children}
          </div>
        </>
      ) : (
        <div className="flex-1" />
      )}

      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </header>
  );
}

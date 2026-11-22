import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog } from 'radix-ui';
import { type ReactNode, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { DURATION, EASE_OUT_EXPO } from '@/lib/motion';

interface ProjectDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Side panel over the right edge of the timeline.
 *
 * Non-modal on purpose: the timeline stays visible and interactive, so edits can be seen
 * live and clicking another bar switches the project. `Esc` and the close button close it.
 * It slides with a transform only (see docs/design.md, Motion).
 */
export function ProjectDrawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: ProjectDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);

  return (
    <Dialog.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Content
              forceMount
              asChild
              onInteractOutside={(event) => {
                event.preventDefault();
              }}
              onOpenAutoFocus={(event) => {
                // Focus the field marked with `data-autofocus` (e.g. the title) when present.
                const target = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]');
                if (target) {
                  event.preventDefault();
                  target.focus();
                }
              }}
            >
              <motion.aside
                ref={panelRef}
                initial={{ x: '100%', opacity: 0.4 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0, transition: { duration: DURATION.base } }}
                transition={{ duration: DURATION.slow, ease: [...EASE_OUT_EXPO] }}
                className="fixed top-(--header-height) right-0 bottom-0 z-40 flex w-full flex-col border-l bg-background shadow-popover outline-none sm:w-(--drawer-width)"
              >
                <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                  <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {title}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">{description}</Dialog.Description>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Fechar painel">
                      <X />
                    </Button>
                  </Dialog.Close>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

                {footer ? (
                  <footer className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
                    {footer}
                  </footer>
                ) : null}
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

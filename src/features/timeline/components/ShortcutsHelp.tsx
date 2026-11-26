import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

import { SHORTCUT_HELP } from '../lib/shortcuts';

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The list of shortcuts, opened with `?` or from the sidebar's keyboard button. */
export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>Teclas que movem e aproximam a linha do tempo.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-1.5">
          {SHORTCUT_HELP.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{shortcut.label}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

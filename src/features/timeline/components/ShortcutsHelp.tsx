import { Keyboard } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';

import { SHORTCUT_HELP } from '../lib/shortcuts';

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Keyboard icon that opens the list of shortcuts (also opened with `?`). */
export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {/* Hidden on phones, where there is rarely a keyboard (`?` still opens it). */}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Atalhos de teclado"
          className="hidden md:inline-flex"
        >
          <Keyboard />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-2">
        <DropdownMenuLabel className="px-1 pb-2 text-label">Atalhos de teclado</DropdownMenuLabel>
        <dl className="flex flex-col gap-1.5 px-1 pb-1">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

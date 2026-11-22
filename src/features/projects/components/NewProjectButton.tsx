import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useProjectShortcuts } from '../hooks/useProjectShortcuts';
import { useDrawerStore } from '../store/drawerStore';

/** Primary action of the app: opens the "new project" form. Also handles the `N` shortcut. */
export function NewProjectButton() {
  const openCreate = useDrawerStore((state) => state.openCreate);
  useProjectShortcuts();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="sm" onClick={openCreate}>
          <Plus />
          <span className="hidden sm:inline">Novo projeto</span>
          <span className="sr-only sm:hidden">Novo projeto</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Criar um projeto{' '}
        <Kbd className="ml-1 border-background/20 bg-background/15 text-background shadow-none">
          N
        </Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

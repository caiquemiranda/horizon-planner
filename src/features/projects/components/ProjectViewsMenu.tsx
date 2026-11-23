import { Archive, EyeOff, Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HIDDEN_HREF, TRASH_HREF } from '@/lib/router';

import { getPlacement } from '../lib/visibility';
import { useProjectsStore } from '../store/projectsStore';

/** Way to the hidden projects and the trash, with their counts. */
export function ProjectViewsMenu() {
  const projects = useProjectsStore((state) => state.projects);
  const counts = useMemo(() => {
    let hidden = 0;
    let trash = 0;
    for (const project of projects) {
      const placement = getPlacement(project);
      if (placement === 'hidden') hidden += 1;
      if (placement === 'trash') trash += 1;
    }
    return { hidden, trash };
  }, [projects]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ocultos e lixeira">
          <Archive />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem asChild>
          <a href={HIDDEN_HREF}>
            <EyeOff />
            <span className="flex-1">Ocultos</span>
            <span className="text-xs text-muted-foreground tabular-nums">{counts.hidden}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={TRASH_HREF}>
            <Trash2 />
            <span className="flex-1">Lixeira</span>
            <span className="text-xs text-muted-foreground tabular-nums">{counts.trash}</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

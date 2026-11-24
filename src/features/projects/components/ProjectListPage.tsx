import { ChartGantt, Eye, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { formatDateRange } from '@/features/timeline/lib/format';
import type { Project } from '@/types/project';

import { COLOR_META } from '../constants';
import { type ProjectPlacement, selectByPlacement } from '../lib/visibility';
import { useDrawerStore } from '../store/drawerStore';
import { useProjectsStore } from '../store/projectsStore';
import { StatusPill } from './LifecycleSection';
import { NavigationDrawerButton, NavigationRail } from './NavigationSidebar';

type ListPlacement = Exclude<ProjectPlacement, 'listed'>;

const COPY: Record<ListPlacement, { title: string; description: string; empty: string }> = {
  hidden: {
    title: 'Projetos ocultos',
    description:
      'Fora das listas padrão, com status, datas e cronograma intactos. Continuam contando nas estatísticas.',
    empty: 'Nenhum projeto oculto.',
  },
  trash: {
    title: 'Lixeira',
    description:
      'Projetos excluídos, com todos os dados. Restaure para voltar a usá-los ou exclua de vez.',
    empty: 'A lixeira está vazia.',
  },
};

interface ProjectListPageProps {
  placement: ListPlacement;
}

/** Hidden projects or the trash: a plain list with the actions that bring them back. */
export function ProjectListPage({ placement }: ProjectListPageProps) {
  const allProjects = useProjectsStore((state) => state.projects);
  const projects = useMemo(
    () => selectByPlacement(allProjects, placement),
    [allProjects, placement],
  );
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const deletePermanently = useProjectsStore((state) => state.deletePermanently);
  const copy = COPY[placement];

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <AppHeader
        leading={<NavigationDrawerButton current={placement} />}
        actions={<ThemeToggle />}
      />

      <div className="flex min-h-0 flex-1">
        <NavigationRail current={placement} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-surface-sunken">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">{copy.title}</h2>
              <p className="text-sm text-muted-foreground">{copy.description}</p>
            </div>

            {projects.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {copy.empty}
              </p>
            ) : (
              <ul aria-label={copy.title} className="flex flex-col gap-2">
                {projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    placement={placement}
                    onDelete={setToDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{toDelete?.title}” permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O projeto, seus marcos e seu cronograma (tarefas e vínculos) serão apagados deste
              navegador. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                if (toDelete) void deletePermanently(toDelete.id);
              }}
            >
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ProjectRowProps {
  project: Project;
  placement: ListPlacement;
  onDelete: (project: Project) => void;
}

function ProjectRow({ project, placement, onDelete }: ProjectRowProps) {
  const unhide = useProjectsStore((state) => state.unhide);
  const expand = useDrawerStore((state) => state.expand);
  const hide = useProjectsStore((state) => state.hide);
  const moveToTrash = useProjectsStore((state) => state.moveToTrash);
  const restore = useProjectsStore((state) => state.restore);
  const showNotice = useNoticeStore((state) => state.show);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background px-3 py-2.5">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: `var(${COLOR_META[project.color].cssVar})` }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{project.title}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateRange(project.startDate, project.endDate)} · {project.progress}% concluído
          {placement === 'trash' && project.hiddenAt ? ' · oculto' : ''}
        </span>
      </div>
      <StatusPill status={project.status} />

      <div className="flex items-center gap-1">
        {placement === 'hidden' ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                expand(project.id);
              }}
            >
              <ChartGantt />
              Abrir cronograma
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void unhide(project.id);
                showNotice(`“${project.title}” voltou às listas.`, 'success', {
                  label: 'Desfazer',
                  run: () => {
                    void hide(project.id);
                  },
                });
              }}
            >
              <Eye />
              Reexibir
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Mover “${project.title}” para a lixeira`}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                void moveToTrash(project.id);
                showNotice(`“${project.title}” foi movido para a lixeira.`, 'success', {
                  label: 'Desfazer',
                  run: () => {
                    void restore(project.id);
                  },
                });
              }}
            >
              <Trash2 />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void restore(project.id);
                showNotice(
                  project.hiddenAt
                    ? `“${project.title}” foi restaurado e continua oculto.`
                    : `“${project.title}” foi restaurado.`,
                );
              }}
            >
              <RotateCcw />
              Restaurar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onDelete(project);
              }}
            >
              <Trash2 />
              Excluir permanentemente
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

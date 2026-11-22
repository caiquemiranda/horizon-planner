import { ArrowLeft, ListTree, Plus, SearchX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { COLOR_META } from '@/features/projects/constants';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { useScheduleStore } from '@/features/schedule/store';
import { formatDateRange } from '@/features/timeline/lib/format';
import { getTodayDay } from '@/features/timeline/lib/time';
import { PORTFOLIO_HREF } from '@/lib/router';
import { cn } from '@/lib/utils';
import type { Project, UUID } from '@/types/project';

import { useWorkspaceActions } from '../hooks/useWorkspaceActions';
import { useWorkspaceModel } from '../hooks/useWorkspaceModel';
import { useWorkspaceUiStore } from '../store/workspaceUiStore';
import { DeleteTaskDialog } from './DeleteTaskDialog';
import { SaveStatus } from './SaveStatus';
import { TaskGrid } from './TaskGrid';
import { WorkspaceToolbar } from './WorkspaceToolbar';

interface ProjectWorkspaceProps {
  projectId: UUID;
}

/**
 * The planning screen of one project: its own route, header with the way back, toolbar
 * and the task table. Mounted with `key={projectId}`, so switching projects always
 * starts from a clean state.
 */
export function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const projectsStatus = useProjectsStore((state) => state.status);
  const project = useProjectsStore((state) => state.projects.find((item) => item.id === projectId));
  const open = useScheduleStore((state) => state.open);
  const close = useScheduleStore((state) => state.close);
  const loadUi = useWorkspaceUiStore((state) => state.load);

  useEffect(() => {
    loadUi(projectId);
    void open(projectId);
    return () => {
      close();
    };
  }, [projectId, open, close, loadUi]);

  useEffect(() => {
    if (!project) return;
    const previous = document.title;
    document.title = `${project.title} · Horizon`;
    return () => {
      document.title = previous;
    };
  }, [project]);

  const isLoadingProjects = projectsStatus === 'idle' || projectsStatus === 'loading';

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <a
        href="#workspace"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('workspace')?.focus();
        }}
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-popover focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para as tarefas
      </a>
      <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b glass px-3 sm:px-4">
        <a
          href={PORTFOLIO_HREF}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            '-ml-1.5 text-muted-foreground',
          )}
        >
          <ArrowLeft />
          <Logo className="size-5" />
          <span className="sr-only sm:not-sr-only">Portfólio</span>
        </a>
        <span aria-hidden="true" className="text-subtle-foreground">
          /
        </span>
        {project ? <ProjectTitle project={project} /> : null}
        <div className="ml-auto flex items-center gap-2">
          <SaveStatus />
          <ThemeToggle />
        </div>
      </header>

      <main
        id="workspace"
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col bg-surface-sunken outline-none"
      >
        {isLoadingProjects ? (
          <WorkspaceSkeleton />
        ) : project ? (
          <WorkspaceBody project={project} />
        ) : (
          <CenteredMessage
            title="Projeto não encontrado"
            description="Ele pode ter sido excluído ou o endereço está incorreto."
            action={
              <a
                href={PORTFOLIO_HREF}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                <ArrowLeft />
                Voltar ao portfólio
              </a>
            }
          />
        )}
      </main>
    </div>
  );
}

function ProjectTitle({ project }: { project: Project }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full', COLOR_META[project.color].swatchClassName)}
      />
      <h1 className="truncate text-[15px] font-semibold">{project.title}</h1>
      <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums md:inline">
        {formatDateRange(project.startDate, project.endDate)} · {project.progress}%
      </span>
    </div>
  );
}

function WorkspaceBody({ project }: { project: Project }) {
  const status = useScheduleStore((state) => state.status);
  const loadError = useScheduleStore((state) => state.loadError);
  const reload = useScheduleStore((state) => state.reload);
  const model = useWorkspaceModel();
  const actions = useWorkspaceActions(model, project.startDate);
  const selectedId = useWorkspaceUiStore((state) => state.selectedId);
  const select = useWorkspaceUiStore((state) => state.select);
  const toggle = useWorkspaceUiStore((state) => state.toggle);
  const filterText = useWorkspaceUiStore((state) => state.filterText);
  const [pendingDelete, setPendingDelete] = useState<UUID | null>(null);
  const [editRequest, setEditRequest] = useState<UUID | null>(null);
  const today = useMemo(() => getTodayDay(), []);

  const addAndEdit = useCallback((id: UUID | null) => {
    if (id) setEditRequest(id);
  }, []);
  const clearEditRequest = useCallback(() => {
    setEditRequest(null);
  }, []);

  if (status === 'error') {
    return (
      <CenteredMessage
        title="Não foi possível abrir o cronograma"
        description={loadError ?? 'Tente novamente.'}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void reload();
            }}
          >
            Tentar de novo
          </Button>
        }
      />
    );
  }

  if (status !== 'ready' || !model) return <WorkspaceSkeleton />;

  const isEmpty = model.schedule.tasks.length === 0;

  return (
    <>
      <WorkspaceToolbar
        model={model}
        selectedId={selectedId}
        onAddTask={() => {
          addAndEdit(actions.addTask(selectedId));
        }}
        onAddSubtask={() => {
          if (selectedId) addAndEdit(actions.addSubtask(selectedId));
        }}
        onIndent={() => {
          if (selectedId) actions.indent(selectedId);
        }}
        onOutdent={() => {
          if (selectedId) actions.outdent(selectedId);
        }}
        onMove={(direction) => {
          if (selectedId) actions.move(selectedId, direction);
        }}
        onDelete={() => {
          if (selectedId) setPendingDelete(selectedId);
        }}
      />
      {isEmpty ? (
        <CenteredMessage
          icon={ListTree}
          title="Nenhuma tarefa ainda"
          description="Crie a primeira tarefa e organize o projeto em fases, tarefas e subtarefas."
          action={
            <Button
              size="sm"
              onClick={() => {
                addAndEdit(actions.addTask(null));
              }}
            >
              <Plus />
              Criar primeira tarefa
            </Button>
          }
        />
      ) : model.rows.length === 0 ? (
        <CenteredMessage
          icon={SearchX}
          title="Nenhuma tarefa encontrada"
          description={`Nenhuma tarefa corresponde a “${filterText}”.`}
        />
      ) : (
        <TaskGrid
          model={model}
          actions={actions}
          selectedId={selectedId}
          onSelect={select}
          onToggle={toggle}
          onRequestDelete={setPendingDelete}
          onTaskCreated={addAndEdit}
          editRequest={editRequest}
          onEditRequestHandled={clearEditRequest}
          today={today}
          label={`Tarefas de ${project.title}`}
        />
      )}
      <DeleteTaskDialog
        model={model}
        taskId={pendingDelete}
        onCancel={() => {
          setPendingDelete(null);
        }}
        onConfirm={(id) => {
          setPendingDelete(null);
          actions.remove(id);
        }}
      />
    </>
  );
}

function WorkspaceSkeleton() {
  return (
    <div role="status" aria-label="Carregando cronograma" className="flex flex-col gap-2 p-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="h-6 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
          style={{ width: `${String(80 - index * 6)}%` }}
        />
      ))}
    </div>
  );
}

interface CenteredMessageProps {
  title: string;
  description: string;
  icon?: typeof ListTree;
  action?: React.ReactNode;
}

function CenteredMessage({ title, description, icon: Icon, action }: CenteredMessageProps) {
  return (
    <div className="flex flex-1 animate-fade-in flex-col items-center justify-center gap-3 p-8 text-center">
      {Icon ? (
        <span className="inline-flex size-12 items-center justify-center rounded-xl border bg-background text-horizon-long shadow-sm">
          <Icon aria-hidden="true" className="size-6" />
        </span>
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

import { ArrowLeft, ListTree, Lock, Plus, SearchX } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { GanttPane } from '@/features/gantt/components/GanttPane';
import type { BarChange } from '@/features/gantt/lib/barDrag';
import {
  NavigationDrawerButton,
  NavigationRail,
} from '@/features/projects/components/NavigationSidebar';
import { COLOR_META } from '@/features/projects/constants';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { getScheduleAccess } from '@/features/schedule/lib/access';
import { createWorkCalendar } from '@/features/schedule/lib/calendar';
import { type AgendaItem, getDailyAgenda } from '@/features/schedule/lib/checkIns';
import type { DependencyCandidate } from '@/features/schedule/lib/dependencies';
import { useScheduleStore } from '@/features/schedule/store';
import { useTimelineShortcuts } from '@/features/timeline/hooks/useTimelineShortcuts';
import { formatDateRange } from '@/features/timeline/lib/format';
import { getTodayDay, getTodayIsoDate } from '@/features/timeline/lib/time';
import { ViewportStoreContext } from '@/features/timeline/store/viewportContext';
import { createViewportStore } from '@/features/timeline/store/viewportStore';
import { PORTFOLIO_HREF } from '@/lib/router';
import { cn } from '@/lib/utils';
import type { Project, UUID } from '@/types/project';

import { useWorkspaceActions } from '../hooks/useWorkspaceActions';
import { useWorkspaceModel } from '../hooks/useWorkspaceModel';
import { formatCellDate } from '../lib/cells';
import { useWorkspaceUiStore } from '../store/workspaceUiStore';
import { CalendarDialog } from './CalendarDialog';
import { DailyCheckInDialog } from './DailyCheckInDialog';
import { DeleteTaskDialog } from './DeleteTaskDialog';
import { ExportMenu } from './ExportMenu';
import { ForecastPanel } from './ForecastPanel';
import { LinksDialog } from './LinksDialog';
import { SaveStatus } from './SaveStatus';
import { SplitView } from './SplitView';
import { TaskGrid } from './TaskGrid';
import { WorkspaceToolbar } from './WorkspaceToolbar';

interface ProjectWorkspaceProps {
  projectId: UUID;
  /**
   * `page`: the `#/projetos/<id>` route. `dialog`: the same workspace inside the expanded
   * project dialog, without changing the route (see `ExpandedProjectDialog`).
   */
  presentation?: 'page' | 'dialog';
  /** Header actions in the dialog presentation: open the full page, close. */
  dialogActions?: ReactNode;
}

/**
 * The planning screen of one project: its own route, header with the way back, toolbar
 * and the task table. Mounted with `key={projectId}`, so switching projects always
 * starts from a clean state.
 */
export function ProjectWorkspace({
  projectId,
  presentation = 'page',
  dialogActions,
}: ProjectWorkspaceProps) {
  const isDialog = presentation === 'dialog';
  const Main = isDialog ? 'div' : 'main';
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

  // Warn before leaving with changes that are not stored yet.
  const hasUnsavedChanges = useScheduleStore(
    (state) =>
      state.saveStatus === 'saving' ||
      state.saveStatus === 'error' ||
      state.saveStatus === 'conflict',
  );
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    // The dialog sits over another page, which keeps its own title.
    if (!project || isDialog) return;
    const previous = document.title;
    document.title = `${project.title} · Horizon`;
    return () => {
      document.title = previous;
    };
  }, [project, isDialog]);

  const isLoadingProjects = projectsStatus === 'idle' || projectsStatus === 'loading';

  return (
    <div className={cn('flex flex-col overflow-hidden', isDialog ? 'h-full' : 'h-svh')}>
      {isDialog ? null : (
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
      )}
      <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b glass px-3 sm:px-4">
        {isDialog ? null : <NavigationDrawerButton current={null} currentProjectId={projectId} />}
        {isDialog ? null : (
          <>
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
          </>
        )}
        {project ? <ProjectTitle project={project} asDialogTitle={isDialog} /> : null}
        <div className="ml-auto flex items-center gap-2">
          <SaveStatus />
          {project ? <ExportMenu project={project} /> : null}
          {isDialog ? dialogActions : <ThemeToggle />}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* The project explorer, collapsible to give the width back to the table and chart. */}
        {isDialog ? null : <NavigationRail current={null} currentProjectId={projectId} />}
        {/* Inside the dialog the page behind already has the `main` landmark. */}
        <Main
          id="workspace"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-sunken outline-none"
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
        </Main>
      </div>
    </div>
  );
}

function ProjectTitle({ project, asDialogTitle }: { project: Project; asDialogTitle: boolean }) {
  const title = <h1 className="truncate text-[15px] font-semibold">{project.title}</h1>;
  // The numbers behind the percentage: done leaf tasks over eligible ones.
  const completion = useScheduleStore((state) =>
    state.projectId === project.id ? state.result?.completion : undefined,
  );
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full', COLOR_META[project.color].swatchClassName)}
      />
      {asDialogTitle ? (
        <Dialog.Title asChild>
          <h2 className="truncate text-[15px] font-semibold">
            {/* Distinct from the project panel, which is also named after the project. */}
            <span className="sr-only">Cronograma de </span>
            {project.title}
          </h2>
        </Dialog.Title>
      ) : (
        title
      )}
      <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums md:inline">
        {formatDateRange(project.startDate, project.endDate)} · {project.progress}%
        {completion && completion.total > 0 ? (
          <>
            {' '}
            · {completion.done} de {completion.total}{' '}
            {completion.total === 1 ? 'tarefa concluída' : 'tarefas concluídas'}
          </>
        ) : null}
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
  const hoveredId = useWorkspaceUiStore((state) => state.hoveredId);
  const setHovered = useWorkspaceUiStore((state) => state.setHovered);
  const splitWidth = useWorkspaceUiStore((state) => state.splitWidth);
  const setSplitWidth = useWorkspaceUiStore((state) => state.setSplitWidth);
  // The chart's own zoom and pan, independent from the portfolio timeline.
  const [ganttViewport] = useState(() => createViewportStore());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<UUID | null>(null);
  const [linksTarget, setLinksTarget] = useState<{ taskId: UUID; focusLinkId: UUID | null } | null>(
    null,
  );
  const showNotice = useNoticeStore((state) => state.show);
  const [editRequest, setEditRequest] = useState<UUID | null>(null);
  const [isCalendarOpen, setCalendarOpen] = useState(false);
  const [isDailyOpen, setDailyOpen] = useState(false);
  // Today's confirmations still missing, for the toolbar badge.
  const dailyPending = useMemo(() => {
    if (!model) return 0;
    const agenda = getDailyAgenda(
      model.schedule,
      model.result,
      createWorkCalendar(model.schedule.calendar),
      getTodayIsoDate(),
    );
    const waiting = (item: AgendaItem) => item.state === 'pending' && !item.complete;
    return agenda.planned.filter(waiting).length + agenda.overdue.filter(waiting).length;
  }, [model]);
  const today = useMemo(() => getTodayDay(), []);
  const access = useScheduleStore((state) => state.access);
  const setAccess = useScheduleStore((state) => state.setAccess);
  const readOnly = !access.canEdit;

  useEffect(() => {
    setAccess(getScheduleAccess(project));
  }, [project, setAccess]);

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
  const range = model.result.range;
  const fitExtent = range ? { start: range.start, end: range.finish } : null;

  return (
    <ViewportStoreContext.Provider value={ganttViewport}>
      <GanttShortcuts fitExtent={fitExtent} />
      <WorkspaceToolbar
        model={model}
        fitExtent={fitExtent}
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
        onEditLinks={() => {
          if (selectedId) setLinksTarget({ taskId: selectedId, focusLinkId: null });
        }}
        onEditCalendar={() => {
          setCalendarOpen(true);
        }}
        onOpenDaily={() => {
          setDailyOpen(true);
        }}
        dailyPending={readOnly ? 0 : dailyPending}
        readOnly={readOnly}
      />
      <ForecastPanel project={project} model={model} actions={actions} readOnly={readOnly} />
      {readOnly ? (
        <p className="flex shrink-0 items-center gap-2 border-b bg-muted/60 px-3 py-2 text-sm">
          <Lock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          {access.reason}
        </p>
      ) : null}
      {isEmpty ? (
        <CenteredMessage
          icon={ListTree}
          title="Nenhuma tarefa ainda"
          description="Crie a primeira tarefa e organize o projeto em fases, tarefas e subtarefas."
          action={
            readOnly ? undefined : (
              <Button
                size="sm"
                onClick={() => {
                  addAndEdit(actions.addTask(null));
                }}
              >
                <Plus />
                Criar primeira tarefa
              </Button>
            )
          }
        />
      ) : model.rows.length === 0 ? (
        <CenteredMessage
          icon={SearchX}
          title="Nenhuma tarefa encontrada"
          description={`Nenhuma tarefa corresponde a “${filterText}”.`}
        />
      ) : (
        <SplitView
          leftWidth={splitWidth}
          onLeftWidthChange={setSplitWidth}
          left={
            <TaskGrid
              model={model}
              actions={actions}
              selectedId={selectedId}
              onSelect={select}
              onToggle={toggle}
              onRequestDelete={setPendingDelete}
              onTaskCreated={addAndEdit}
              onEditLinks={(id) => {
                setLinksTarget({ taskId: id, focusLinkId: null });
              }}
              editRequest={editRequest}
              onEditRequestHandled={clearEditRequest}
              today={today}
              label={`Tarefas de ${project.title}`}
              scrollerRef={scrollerRef}
              hoveredId={hoveredId}
              onHover={setHovered}
              readOnly={readOnly}
            />
          }
          right={
            <GanttPane
              model={model}
              scrollerRef={scrollerRef}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={select}
              onHover={setHovered}
              barColor={`var(${COLOR_META[project.color].cssVar})`}
              today={today}
              activeLinkId={linksTarget?.focusLinkId ?? null}
              onOpenLink={(linkId) => {
                const link = model.schedule.dependencies.find((item) => item.id === linkId);
                if (link) setLinksTarget({ taskId: link.successorId, focusLinkId: link.id });
              }}
              {...(readOnly
                ? {}
                : {
                    onBarChange: (taskId: UUID, change: BarChange) => {
                      const error = actions.update(taskId, change.patch);
                      if (error) {
                        showNotice(error, 'error');
                        return;
                      }
                      // Automatic tasks never start before their predecessors allow.
                      const after = useScheduleStore.getState().result?.tasks.get(taskId);
                      if (after && after.start > change.start && after.drivingDependencyId) {
                        const link = useScheduleStore
                          .getState()
                          .schedule?.dependencies.find(
                            (item) => item.id === after.drivingDependencyId,
                          );
                        showNotice(
                          `${model.describeTask(taskId)} não pode começar antes de ${formatCellDate(after.start)}: depende de ${link ? model.describeTask(link.predecessorId) : 'outra tarefa'}.`,
                          'error',
                        );
                      }
                    },
                    onCreateLink: (candidate: DependencyCandidate) => {
                      const error = actions.addLink(candidate);
                      if (error) showNotice(error, 'error');
                      else
                        showNotice(
                          `Vínculo criado: ${model.describeTask(candidate.predecessorId)} → ${model.describeTask(candidate.successorId)}.`,
                        );
                    },
                  })}
            />
          }
        />
      )}
      <LinksDialog
        model={model}
        actions={actions}
        taskId={linksTarget?.taskId ?? null}
        focusLinkId={linksTarget?.focusLinkId ?? null}
        onClose={() => {
          setLinksTarget(null);
        }}
        readOnly={readOnly}
      />
      <DailyCheckInDialog
        open={isDailyOpen}
        model={model}
        actions={actions}
        readOnly={readOnly}
        onClose={() => {
          setDailyOpen(false);
        }}
      />
      <CalendarDialog
        open={isCalendarOpen}
        calendar={model.schedule.calendar}
        readOnly={readOnly}
        onClose={() => {
          setCalendarOpen(false);
        }}
        onSave={(calendar) => {
          const error = actions.setCalendar(calendar);
          if (!error) showNotice('Calendário salvo: as tarefas foram reagendadas.');
          return error;
        }}
      />
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
    </ViewportStoreContext.Provider>
  );
}

/** Zoom, pan and "fit" shortcuts on the chart (ignored while typing or in the table). */
function GanttShortcuts({ fitExtent }: { fitExtent: { start: number; end: number } | null }) {
  useTimelineShortcuts({ getFitRange: () => fitExtent });
  return null;
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

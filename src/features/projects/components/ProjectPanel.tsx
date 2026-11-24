import { ChartGantt } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import type { Project } from '@/types/project';

import { useDrawerStore } from '../store/drawerStore';
import { useProjectsStore } from '../store/projectsStore';
import { ProjectCreator } from './ProjectCreator';
import { ProjectDrawer } from './ProjectDrawer';
import { ProjectEditor } from './ProjectEditor';

interface ProjectPanelProps {
  /** E.g. to bring the new project into view on the timeline. */
  onProjectCreated?: (project: Project) => void;
}

/** Connects the drawer to the stores: which project is open, its data, create and delete. */
export function ProjectPanel({ onProjectCreated }: ProjectPanelProps) {
  const view = useDrawerStore((state) => state.view);
  const close = useDrawerStore((state) => state.close);
  const openProject = useDrawerStore((state) => state.openProject);
  const expand = useDrawerStore((state) => state.expand);
  const projects = useProjectsStore((state) => state.projects);
  const status = useProjectsStore((state) => state.status);

  // A project in the trash cannot be edited: it is restored first, from the trash.
  const project =
    view.mode === 'edit'
      ? projects.find((item) => item.id === view.projectId && item.deletedAt === null)
      : undefined;
  const categories = useMemo(
    () =>
      [...new Set(projects.flatMap((item) => (item.category ? [item.category] : [])))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      ),
    [projects],
  );

  // A project deleted or trashed elsewhere (or a stale id) closes the panel.
  const isMissing = view.mode === 'edit' && status === 'ready' && !project;
  useEffect(() => {
    if (isMissing) close();
  }, [isMissing, close]);

  const isCreating = view.mode === 'create';
  const isOpen = isCreating || Boolean(project);

  return (
    <ProjectDrawer
      open={isOpen}
      onClose={close}
      title={isCreating ? 'Novo projeto' : (project?.title ?? '')}
      headerActions={
        project ? (
          // One way to the schedule, without leaving the page: the large dialog.
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              expand(project.id);
            }}
          >
            <ChartGantt />
            Abrir cronograma
          </Button>
        ) : null
      }
      description={
        isCreating
          ? 'Preencha os dados para criar um projeto.'
          : 'Edite o projeto. As alterações aparecem na linha do tempo e são salvas automaticamente.'
      }
    >
      {isCreating ? (
        <ProjectCreator
          today={getTodayIsoDate()}
          categories={categories}
          onCancel={close}
          onCreated={(created) => {
            openProject(created.id);
            onProjectCreated?.(created);
          }}
        />
      ) : null}
      {project ? (
        <ProjectEditor
          key={project.id}
          project={project}
          categories={categories}
          onDismissed={close}
        />
      ) : null}
    </ProjectDrawer>
  );
}

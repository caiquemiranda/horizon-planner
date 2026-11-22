import { useEffect, useMemo } from 'react';

import { useDrawerStore } from '../store/drawerStore';
import { useProjectsStore } from '../store/projectsStore';
import { ProjectDrawer } from './ProjectDrawer';
import { ProjectEditor } from './ProjectEditor';

/** Connects the drawer to the stores: which project is open and its data. */
export function ProjectPanel() {
  const view = useDrawerStore((state) => state.view);
  const close = useDrawerStore((state) => state.close);
  const project = useProjectsStore((state) =>
    view.mode === 'edit' ? state.projects.find((item) => item.id === view.projectId) : undefined,
  );
  const status = useProjectsStore((state) => state.status);
  const projects = useProjectsStore((state) => state.projects);
  const categories = useMemo(
    () =>
      [...new Set(projects.flatMap((item) => (item.category ? [item.category] : [])))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      ),
    [projects],
  );

  // A project deleted elsewhere (or a stale id) closes the panel.
  const isMissing = view.mode === 'edit' && status === 'ready' && !project;
  useEffect(() => {
    if (isMissing) close();
  }, [isMissing, close]);

  const isOpen = view.mode === 'create' || Boolean(project);
  const title = view.mode === 'create' ? 'Novo projeto' : (project?.title ?? '');

  return (
    <ProjectDrawer
      open={isOpen}
      onClose={close}
      title={title}
      description={
        view.mode === 'create'
          ? 'Preencha os dados para criar um projeto.'
          : 'Edite o projeto. As alterações aparecem na linha do tempo e são salvas automaticamente.'
      }
    >
      {project ? (
        <ProjectEditor key={project.id} project={project} categories={categories} />
      ) : null}
    </ProjectDrawer>
  );
}

import { useEffect } from 'react';

import { DataNotice } from '@/features/data-io/components/DataNotice';
import { ImportPage } from '@/features/data-io/components/ImportPage';
import { DashboardPage } from '@/features/projects/components/DashboardPage';
import { ProjectListPage } from '@/features/projects/components/ProjectListPage';
import { ProjectsErrorAlert } from '@/features/projects/components/ProjectsErrorAlert';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { ProjectWorkspace } from '@/features/workspace/components/ProjectWorkspace';
import { useRoute } from '@/lib/router';

import { PortfolioPage } from './PortfolioPage';

/** Loads the portfolio once and shows the page for the current route. */
export function App() {
  const load = useProjectsStore((state) => state.load);
  const route = useRoute();

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {route.name === 'project' ? (
        <ProjectWorkspace key={route.projectId} projectId={route.projectId} />
      ) : route.name === 'import' ? (
        <ImportPage />
      ) : route.name === 'dashboard' ? (
        <DashboardPage />
      ) : route.name === 'hidden' || route.name === 'trash' ? (
        <ProjectListPage placement={route.name === 'hidden' ? 'hidden' : 'trash'} />
      ) : (
        <PortfolioPage section={route.section} />
      )}
      <ProjectsErrorAlert />
      <DataNotice />
    </>
  );
}

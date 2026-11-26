import { useEffect } from 'react';

import { DataNotice } from '@/features/data-io/components/DataNotice';
import { ImportPage } from '@/features/data-io/components/ImportPage';
import { ExamplesPage } from '@/features/examples/components/ExamplesPage';
import { DashboardPage } from '@/features/projects/components/DashboardPage';
import { ProjectListPage } from '@/features/projects/components/ProjectListPage';
import { ProjectsErrorAlert } from '@/features/projects/components/ProjectsErrorAlert';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { ReportPage } from '@/features/report/components/ReportPage';
import { ExpandedProjectDialog } from '@/features/workspace/components/ExpandedProjectDialog';
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
      ) : route.name === 'report' ? (
        <ReportPage key={route.projectId} projectId={route.projectId} />
      ) : route.name === 'import' ? (
        <ImportPage />
      ) : route.name === 'examples' ? (
        <ExamplesPage />
      ) : route.name === 'dashboard' ? (
        <DashboardPage />
      ) : route.name === 'hidden' || route.name === 'trash' ? (
        <ProjectListPage placement={route.name === 'hidden' ? 'hidden' : 'trash'} />
      ) : (
        <PortfolioPage section={route.section} />
      )}
      {/* The large schedule dialog, opened from any page without changing the route. */}
      {route.name === 'project' || route.name === 'report' ? null : <ExpandedProjectDialog />}
      <ProjectsErrorAlert />
      <DataNotice />
    </>
  );
}

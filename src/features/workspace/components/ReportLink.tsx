import { FileChartColumn } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button-variants';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { reportHref } from '@/lib/router';
import type { UUID } from '@/types/project';

/** "Relatório": the project's report page (leaving the large dialog, if open). */
export function ReportLink({ projectId }: { projectId: UUID }) {
  const closeExpanded = useDrawerStore((state) => state.closeExpanded);
  return (
    <a
      href={reportHref(projectId)}
      aria-label="Visualizar relatório"
      onClick={() => {
        closeExpanded();
      }}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      <FileChartColumn />
      <span className="hidden sm:inline">Relatório</span>
    </a>
  );
}

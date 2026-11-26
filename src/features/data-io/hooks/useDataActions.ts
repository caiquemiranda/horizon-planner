import { useCallback } from 'react';

import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { selectOwnProjects } from '@/features/projects/lib/visibility';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { getProjectsExtent } from '@/features/timeline/lib/layout';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { scheduleRepository } from '@/services/persistence';
import type { Project } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { createBackup, downloadTextFile, getBackupFileName, serializeBackup } from '../lib/backup';
import { useNoticeStore } from '../store/noticeStore';

export function pluralizeProjects(count: number): string {
  return `${String(count)} ${count === 1 ? 'projeto' : 'projetos'}`;
}

export interface DataActions {
  exportBackup: () => Promise<void>;
  /**
   * Replaces every project and schedule, resets the view around them and confirms with
   * `notice`. Schedules of projects that are not in `projects` are dropped.
   */
  replaceProjects: (
    projects: Project[],
    notice: string,
    schedules?: ProjectSchedule[],
  ) => Promise<void>;
  clearAll: () => Promise<void>;
}

/** Whole-collection actions shared by the data menu and the empty state. */
export function useDataActions(): DataActions {
  const replaceAll = useProjectsStore((state) => state.replaceAll);
  const showNotice = useNoticeStore((state) => state.show);

  const exportBackup = useCallback(async () => {
    const now = new Date();
    // The samples are not the user's data: "Exemplos" installs them again at any time.
    const projects = selectOwnProjects(useProjectsStore.getState().projects);
    let schedules: ProjectSchedule[];
    try {
      schedules = await scheduleRepository.listAll();
    } catch {
      showNotice('Não foi possível ler os cronogramas; o backup não foi gerado.', 'error');
      return;
    }
    downloadTextFile(
      serializeBackup(createBackup(projects, now, schedules)),
      getBackupFileName(now),
    );
    showNotice(`Backup exportado com ${pluralizeProjects(projects.length)}.`);
  }, [showNotice]);

  const replaceProjects = useCallback(
    async (projects: Project[], notice: string, schedules: ProjectSchedule[] = []) => {
      try {
        await replaceAll(projects);
      } catch {
        // The store already exposes the error to the user.
        return;
      }
      try {
        const projectIds = new Set(projects.map((project) => project.id));
        await scheduleRepository.replaceAll(
          schedules.filter((schedule) => projectIds.has(schedule.projectId)),
        );
      } catch {
        showNotice(
          'Os projetos foram salvos, mas os cronogramas não puderam ser gravados.',
          'error',
        );
        return;
      }
      // A fresh data set: nothing open, nothing hidden, everything in view.
      useDrawerStore.getState().close();
      useFiltersStore.getState().clearAll();
      const extent = getProjectsExtent(projects);
      if (extent) useViewportStore.getState().fitRange(extent.start, extent.end);
      else useViewportStore.getState().goToToday();
      showNotice(notice);
    },
    [replaceAll, showNotice],
  );

  const clearAll = useCallback(
    () => replaceProjects([], 'Todos os projetos foram apagados.'),
    [replaceProjects],
  );

  return { exportBackup, replaceProjects, clearAll };
}

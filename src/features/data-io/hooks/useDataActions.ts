import { useCallback } from 'react';

import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { getProjectsExtent } from '@/features/timeline/lib/layout';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import type { Project } from '@/types/project';

import { createBackup, downloadTextFile, getBackupFileName, serializeBackup } from '../lib/backup';
import { createSampleProjects } from '../lib/sampleData';
import { useNoticeStore } from '../store/noticeStore';

export function pluralizeProjects(count: number): string {
  return `${String(count)} ${count === 1 ? 'projeto' : 'projetos'}`;
}

export interface DataActions {
  exportBackup: () => void;
  /** Replaces every project, resets the view around them and confirms with `notice`. */
  replaceProjects: (projects: Project[], notice: string) => Promise<void>;
  loadSample: () => Promise<void>;
  clearAll: () => Promise<void>;
}

/** Whole-collection actions shared by the data menu and the empty state. */
export function useDataActions(): DataActions {
  const replaceAll = useProjectsStore((state) => state.replaceAll);
  const showNotice = useNoticeStore((state) => state.show);

  const exportBackup = useCallback(() => {
    const now = new Date();
    const { projects } = useProjectsStore.getState();
    downloadTextFile(serializeBackup(createBackup(projects, now)), getBackupFileName(now));
    showNotice(`Backup exportado com ${pluralizeProjects(projects.length)}.`);
  }, [showNotice]);

  const replaceProjects = useCallback(
    async (projects: Project[], notice: string) => {
      try {
        await replaceAll(projects);
      } catch {
        // The store already exposes the error to the user.
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

  const loadSample = useCallback(
    () => replaceProjects(createSampleProjects(getTodayIsoDate()), 'Dados de exemplo carregados.'),
    [replaceProjects],
  );

  const clearAll = useCallback(
    () => replaceProjects([], 'Todos os projetos foram apagados.'),
    [replaceProjects],
  );

  return { exportBackup, replaceProjects, loadSample, clearAll };
}

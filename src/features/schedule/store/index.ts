import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { scheduleRepository } from '@/services/persistence';

import { getProjectSyncPatch } from '../lib/portfolioSync';
import { createScheduleStore } from './scheduleStore';

/**
 * The app's workspace store. After each save, the portfolio project is updated from the
 * schedule (dates and progress), so both views tell the same story.
 */
export const useScheduleStore = createScheduleStore(scheduleRepository, {
  onSaved: (schedule, result) => {
    const projects = useProjectsStore.getState();
    const project = projects.projects.find((item) => item.id === schedule.projectId);
    if (!project) return;
    const patch = getProjectSyncPatch(project, result);
    if (patch) void projects.update(project.id, patch);
  },
});

export * from './scheduleStore';

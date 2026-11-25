import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { scheduleRepository } from '@/services/persistence';

import { createImportCommitter } from '../lib/wbsCommit';

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The app's import committer, writing through the projects store and the schedule repository. */
export const importCommitter = createImportCommitter({
  createProject: (draft) => useProjectsStore.getState().create(draft),
  saveSchedule: (schedule) => scheduleRepository.save(schedule, 0),
  // Permanent deletion only exists from the trash; the project was never shown anyway.
  removeProject: async (id) => {
    const store = useProjectsStore.getState();
    await store.moveToTrash(id);
    await useProjectsStore.getState().deletePermanently(id);
  },
  projectExists: (id) =>
    useProjectsStore
      .getState()
      .projects.some((project) => project.id === id && project.deletedAt === null),
  storage: getStorage(),
});

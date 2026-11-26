import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { scheduleRepository } from '@/services/persistence';
import type { ISODate, Project, UUID } from '@/types/project';
import type { ProjectSchedule } from '@/types/schedule';

import { createExamples, EXAMPLE_IDS } from '../lib/catalog';
import { type CloneOptions, createProjectFromExample } from '../lib/clone';

/**
 * The examples actions of the app, over the projects store and the schedule repository.
 * They only ever touch sample projects (`demo`) and their schedules: the user's own
 * projects are kept exactly as stored.
 */

function sampleIds(): Set<UUID> {
  const ids = new Set<UUID>(Object.values(EXAMPLE_IDS));
  for (const project of useProjectsStore.getState().projects) {
    if (project.demo) ids.add(project.id);
  }
  return ids;
}

async function replaceSampleSchedules(schedules: readonly ProjectSchedule[]): Promise<void> {
  const ids = sampleIds();
  const kept = (await scheduleRepository.listAll()).filter(
    (schedule) => !ids.has(schedule.projectId),
  );
  await scheduleRepository.replaceAll([...kept, ...schedules]);
}

/**
 * Installs the samples as of `today`, or reinstalls them: fixed ids, so they are never
 * duplicated and any earlier state of them is reset. Schedules are written first, so a
 * failure never leaves a sample project without its plan.
 */
export async function installExamples(today: ISODate): Promise<void> {
  const examples = createExamples(today);
  await replaceSampleSchedules(examples.map((example) => example.schedule));
  await useProjectsStore.getState().replaceExamples(examples.map((example) => example.project));
}

/** Removes the samples and their schedules. */
export async function removeExamples(): Promise<void> {
  const ids = sampleIds();
  await useProjectsStore.getState().replaceExamples([]);
  const kept = (await scheduleRepository.listAll()).filter(
    (schedule) => !ids.has(schedule.projectId),
  );
  await scheduleRepository.replaceAll(kept);
}

/** A real project with the plan of an installed sample (see `lib/clone.ts`). */
export async function createFromExample(example: Project, options: CloneOptions): Promise<Project> {
  const schedule = await scheduleRepository.get(example.id);
  if (!schedule) throw new Error('O cronograma do exemplo não foi encontrado.');
  return createProjectFromExample(
    {
      createProject: (draft) => useProjectsStore.getState().create(draft),
      saveSchedule: (cloned) => scheduleRepository.save(cloned, 0),
      // Permanent deletion only exists from the trash; the project was never shown anyway.
      removeProject: async (id) => {
        await useProjectsStore.getState().moveToTrash(id);
        await useProjectsStore.getState().deletePermanently(id);
      },
    },
    { project: example, schedule },
    options,
  );
}

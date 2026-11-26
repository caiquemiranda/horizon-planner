import { SNAPSHOT_SCHEMA_VERSION } from '@/features/projects/constants';
import { DEFAULT_STORAGE_KEY } from '@/services/persistence/LocalStorageRepository';
import {
  SCHEDULE_KEY_PREFIX,
  SCHEDULE_STORAGE_VERSION,
} from '@/services/persistence/LocalStorageScheduleRepository';
import type { ISODate } from '@/types/project';

import { createSampleData } from './sampleData';

/**
 * The test portfolio (`sampleData.ts`) as `localStorage` entries, for browser tests and the
 * screenshot script: they write these before the app starts instead of clicking through
 * the UI. The app itself never writes this data.
 */
export function createSampleStorage(today: ISODate, now = new Date()): [string, string][] {
  const { projects, schedules } = createSampleData(today, { now });
  return [
    [
      DEFAULT_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        exportedAt: now.toISOString(),
        projects,
      }),
    ],
    ...schedules.map((schedule): [string, string] => [
      SCHEDULE_KEY_PREFIX + schedule.projectId,
      JSON.stringify({ schemaVersion: SCHEDULE_STORAGE_VERSION, schedule }),
    ]),
  ];
}

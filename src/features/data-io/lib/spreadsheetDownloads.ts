import { computeForecast } from '@/features/schedule/lib/forecast';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import type { Project } from '@/types/project';
import type { ProjectSchedule, ScheduleResult } from '@/types/schedule';

import {
  buildProjectWorkbook,
  buildTasksCsvRows,
  buildTemplateWorkbook,
  getWbsFileName,
} from './wbsWorkbook';

/**
 * Builds and downloads spreadsheets. The writers are loaded only here, on demand, so the
 * zip library stays out of the first load of the app.
 */

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadBytes(bytes: Uint8Array | string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export async function downloadTemplate(): Promise<void> {
  const { writeXlsx } = await import('@/lib/spreadsheet/xlsxWriter');
  downloadBytes(writeXlsx(buildTemplateWorkbook()), getWbsFileName(null, 'xlsx'), XLSX_TYPE);
}

export async function downloadProjectSpreadsheet(
  format: 'xlsx' | 'csv',
  project: Project,
  schedule: ProjectSchedule,
  plan: ScheduleResult,
): Promise<void> {
  const forecast = computeForecast(schedule, plan, getTodayIsoDate());
  const fileName = getWbsFileName(project.title, format);
  if (format === 'xlsx') {
    const { writeXlsx } = await import('@/lib/spreadsheet/xlsxWriter');
    downloadBytes(
      writeXlsx(buildProjectWorkbook(project, schedule, plan, forecast)),
      fileName,
      XLSX_TYPE,
    );
  } else {
    const { writeCsv } = await import('@/lib/spreadsheet/csvWriter');
    downloadBytes(writeCsv(buildTasksCsvRows(schedule, plan, forecast)), fileName, 'text/csv');
  }
}

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import type { WorkCalendar } from '@/features/schedule/lib/calendar';
import { getDisplayFinish } from '@/features/schedule/lib/engine';
import { dayToIsoDate, dayToLocalDate, isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';
import type { ScheduledTask } from '@/types/schedule';
import type { DayNumber } from '@/types/timeline';

/**
 * Parsing and formatting of TreeGrid cells. Input is pt-BR and forgiving ("3", "3d",
 * "3 dias", "45%"); what is stored never depends on the language.
 */

export type CellResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): CellResult<T> => ({ ok: true, value });
const fail = <T>(error: string): CellResult<T> => ({ ok: false, error });

/** `3`, `3d`, `3 dias`, `1 dia` → working days. */
export function parseDurationInput(text: string): CellResult<number> {
  const match = /^\s*(\d+)\s*(d|dia|dias)?\s*$/i.exec(text);
  if (!match) return fail('Informe a duração em dias úteis, por exemplo 3 ou 3d.');
  return ok(Number(match[1]));
}

/** `45`, `45%` → 0–100. */
export function parseProgressInput(text: string): CellResult<number> {
  const match = /^\s*(\d+)\s*%?\s*$/.exec(text);
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return fail('O progresso deve ser um número inteiro entre 0 e 100.');
  }
  return ok(value);
}

/** Value of an `<input type="date">` (`yyyy-MM-dd`). */
export function parseDateInput(text: string): CellResult<ISODate> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fail('Informe uma data válida.');
  try {
    isoDateToDay(text as ISODate);
  } catch {
    return fail('Informe uma data válida.');
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (date.getUTCMonth() !== (month ?? 1) - 1) return fail('Informe uma data válida.');
  return ok(text as ISODate);
}

/**
 * Editing "Término" keeps the start and changes the duration, so that the last working
 * day is `finish`. A finish on a non-working day counts up to the previous working day.
 */
export function durationForFinish(
  calendar: WorkCalendar,
  start: DayNumber,
  finish: ISODate,
): CellResult<number> {
  const finishDay = isoDateToDay(finish);
  if (finishDay < start) return fail('O término não pode ser anterior ao início.');
  const duration = calendar.countWorkingDays(start, finishDay + 1);
  if (duration === 0) return fail('Não há dias úteis entre o início e o término.');
  return ok(duration);
}

/** `23/11/2026` */
export function formatCellDate(day: DayNumber): string {
  return format(dayToLocalDate(day), 'dd/MM/yyyy', { locale: ptBR });
}

/** For tooltips and descriptions: `segunda-feira, 23 de novembro de 2026`. */
export function formatLongDate(day: DayNumber): string {
  return format(dayToLocalDate(day), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function formatDuration(duration: number): string {
  return duration === 1 ? '1 dia' : `${String(duration)} dias`;
}

export type TaskStatus = 'done' | 'in_progress' | 'late' | 'not_started';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  done: 'Concluída',
  in_progress: 'Em andamento',
  late: 'Atrasada',
  not_started: 'Não iniciada',
};

/**
 * Derived status: there is no separate status field to keep in sync with progress.
 * "Atrasada" means the last working day has passed and the work is not complete.
 */
export function getTaskStatus(task: ScheduledTask, today: DayNumber): TaskStatus {
  if (task.progress >= 100) return 'done';
  if (getDisplayFinish(task) < Math.floor(today)) return 'late';
  if (task.progress > 0) return 'in_progress';
  return 'not_started';
}

/** Start used for a new task: the selected task's start, the project start or today. */
export function defaultStartFor(reference: ScheduledTask | undefined, fallback: ISODate): ISODate {
  return reference ? dayToIsoDate(reference.start) : fallback;
}

/** Whether a leaf task can be edited in the duration/date/progress columns. */
export function isLeaf(scheduled: ScheduledTask | undefined): boolean {
  return scheduled !== undefined && scheduled.kind !== 'summary';
}

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { STATUS_META } from '@/features/projects/constants';
import type { ISODate, Project } from '@/types/project';
import type { DayNumber } from '@/types/timeline';

import { dayToLocalDate, isoDateToDay, isoRangeToDays } from './time';

/** Human-readable labels for dates and durations shown on the timeline (pt-BR). */

const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;
/** From roughly a full year, durations are shown in years. */
const MONTHS_UNTIL_YEARS = 11.8;

const decimalFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function toLocalDate(date: ISODate): Date {
  return dayToLocalDate(isoDateToDay(date));
}

/** `2026-03-09` → `9 mar 2026` */
export function formatDate(date: ISODate): string {
  return format(toLocalDate(date), 'd MMM yyyy', { locale: ptBR });
}

/** `11 – 20 mar 2026`, `9 mar – 20 abr 2026` or `15 nov 2026 – 3 fev 2027`. */
export function formatDateRange(startDate: ISODate, endDate: ISODate): string {
  const start = toLocalDate(startDate);
  const end = toLocalDate(endDate);

  if (startDate === endDate) return formatDate(startDate);

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const startPattern = sameMonth ? 'd' : sameYear ? 'd MMM' : 'd MMM yyyy';
  return `${format(start, startPattern, { locale: ptBR })} – ${formatDate(endDate)}`;
}

/** Inclusive length of a range, rounded to the most natural unit: `12 dias`, `3 meses`, `1,5 ano`. */
export function formatDuration(startDate: ISODate, endDate: ISODate): string {
  const { start, end } = isoRangeToDays(startDate, endDate);
  const days = end - start;

  if (days <= 31) return days === 1 ? '1 dia' : `${String(days)} dias`;

  if (days < MONTHS_UNTIL_YEARS * DAYS_PER_MONTH) {
    const months = Math.max(1, Math.round(days / DAYS_PER_MONTH));
    return months === 1 ? '1 mês' : `${String(months)} meses`;
  }

  const years = Math.round((days / DAYS_PER_YEAR) * 2) / 2;
  return `${decimalFormat.format(years)} ${years < 2 ? 'ano' : 'anos'}`;
}

/** Visible window of the timeline, e.g. `nov 2026 – mar 2027` or `mar 2026` for a single month. */
export function formatVisibleRange(from: DayNumber, to: DayNumber): string {
  const start = format(dayToLocalDate(from), 'MMM yyyy', { locale: ptBR });
  // `to` is exclusive: the last visible moment belongs to the previous day at most.
  const end = format(dayToLocalDate(Math.max(from, to - 1e-6)), 'MMM yyyy', { locale: ptBR });
  return start === end ? start : `${start} – ${end}`;
}

/**
 * Spoken summary of a bar, e.g. "Em andamento, 11 – 20 mar 2026, 45% concluído,
 * 1 de 2 marcos concluídos". Screen readers get what the bar shows visually.
 */
export function describeProject(project: Project): string {
  const parts = [
    STATUS_META[project.status].label,
    formatDateRange(project.startDate, project.endDate),
    `${String(project.progress)}% concluído`,
  ];
  const total = project.milestones.length;
  if (total > 0) {
    const done = project.milestones.filter((milestone) => milestone.completed).length;
    parts.push(
      `${String(done)} de ${String(total)} ${total === 1 ? 'marco concluído' : 'marcos concluídos'}`,
    );
  }
  return parts.join(', ');
}

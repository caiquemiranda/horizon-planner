import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import type { ISODate } from '@/types/project';

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

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  getQuarter,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import type { Granularity, Tick, TickUnit, Viewport, ZoomPreset } from '@/types/timeline';

import { dayToX, getVisibleRange } from './scale';
import { dayToLocalDate, localDateToDay } from './time';

/**
 * Zoom bands, from the most detailed to the most zoomed out.
 * The ruler shows `major` on the top row and `minor` on the bottom row.
 */
const MACRO_GRANULARITY: Granularity = { major: 'year', minor: 'half', minPxPerDay: 0 };

export const GRANULARITIES: readonly Granularity[] = [
  { major: 'week', minor: 'day', minPxPerDay: 12 },
  { major: 'month', minor: 'week', minPxPerDay: 3 },
  { major: 'quarter', minor: 'month', minPxPerDay: 0.6 },
  { major: 'year', minor: 'quarter', minPxPerDay: 0.15 },
  MACRO_GRANULARITY,
];

/** Presets offered by the zoom controls (visible span assumes ~1200 px). */
export const ZOOM_PRESETS: readonly ZoomPreset[] = [
  { id: 'years', label: 'Anos', pxPerDay: 0.33 },
  { id: 'quarters', label: 'Trimestres', pxPerDay: 1.6 },
  { id: 'months', label: 'Meses', pxPerDay: 6.5 },
  { id: 'weeks', label: 'Semanas', pxPerDay: 28 },
  { id: 'days', label: 'Dias', pxPerDay: 85 },
];

export function getGranularity(pxPerDay: number): Granularity {
  return (
    GRANULARITIES.find((granularity) => pxPerDay >= granularity.minPxPerDay) ?? MACRO_GRANULARITY
  );
}

/** Average length of each unit, used only to estimate label spacing. */
const APPROX_DAYS: Record<TickUnit, number> = {
  year: 365.25,
  half: 182.6,
  quarter: 91.3,
  month: 30.44,
  week: 7,
  day: 1,
};

/** Allowed multiples per unit when cells get too narrow for their labels. */
const STEPS: Record<TickUnit, readonly number[]> = {
  year: [1, 2, 5, 10, 25, 50, 100],
  half: [1, 2, 4, 10, 20],
  quarter: [1, 2, 4],
  month: [1, 2, 3, 6],
  week: [1, 2, 4],
  day: [1, 2, 7],
};

/** Smallest step whose cells are at least `minSpacingPx` wide. */
export function chooseStep(unit: TickUnit, pxPerDay: number, minSpacingPx: number): number {
  const steps = STEPS[unit];
  const fitting = steps.find((step) => APPROX_DAYS[unit] * step * pxPerDay >= minSpacingPx);
  return fitting ?? steps[steps.length - 1] ?? 1;
}

/** 1970-01-05 was a Monday: week indexes count Monday-based weeks from there. */
const FIRST_MONDAY_DAY = 4;

function startOfUnit(date: Date, unit: TickUnit): Date {
  switch (unit) {
    case 'year':
      return startOfYear(date);
    case 'half':
      return new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1);
    case 'quarter':
      return startOfQuarter(date);
    case 'month':
      return startOfMonth(date);
    case 'week':
      return startOfWeek(date, { weekStartsOn: 1 });
    case 'day':
      return date;
  }
}

function addUnits(date: Date, unit: TickUnit, amount: number): Date {
  switch (unit) {
    case 'year':
      return addYears(date, amount);
    case 'half':
      return addMonths(date, amount * 6);
    case 'quarter':
      return addMonths(date, amount * 3);
    case 'month':
      return addMonths(date, amount);
    case 'week':
      return addWeeks(date, amount);
    case 'day':
      return addDays(date, amount);
  }
}

/** Sequential index of the unit containing `date`, used to align stepped ticks. */
function unitIndex(date: Date, unit: TickUnit): number {
  const year = date.getFullYear();
  const month = date.getMonth();

  switch (unit) {
    case 'year':
      return year;
    case 'half':
      return year * 2 + (month < 6 ? 0 : 1);
    case 'quarter':
      return year * 4 + Math.floor(month / 3);
    case 'month':
      return year * 12 + month;
    case 'week':
      return Math.floor((localDateToDay(date) - FIRST_MONDAY_DAY) / 7);
    case 'day':
      return localDateToDay(date);
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type TickRole = 'major' | 'minor';

/** pt-BR labels. Major ticks carry context (year), minor ticks are compact. */
export function formatTickLabel(date: Date, unit: TickUnit, role: TickRole): string {
  const year = format(date, 'yyyy');

  switch (unit) {
    case 'year':
      return year;
    case 'half': {
      const half = date.getMonth() < 6 ? 'S1' : 'S2';
      return role === 'major' ? `${half} ${year}` : half;
    }
    case 'quarter': {
      const quarter = `T${getQuarter(date)}`;
      return role === 'major' ? `${quarter} ${year}` : quarter;
    }
    case 'month':
      return role === 'major'
        ? capitalize(format(date, 'MMMM yyyy', { locale: ptBR }))
        : format(date, 'MMM', { locale: ptBR });
    case 'week':
      return role === 'major' ? format(date, 'd MMM yyyy', { locale: ptBR }) : format(date, 'd');
    case 'day': {
      if (role === 'minor') return format(date, 'd');
      // pt-BR abbreviations from date-fns vary between versions; derive "seg", "sáb"…
      const weekday = format(date, 'EEEE', { locale: ptBR }).slice(0, 3);
      return `${capitalize(weekday)}, ${format(date, 'd MMM', { locale: ptBR })}`;
    }
  }
}

export interface GenerateTicksOptions {
  role?: TickRole;
  /** Minimum cell width; narrower cells are merged using larger steps. */
  minSpacingPx?: number;
  /** Safety cap against runaway loops. */
  maxTicks?: number;
}

const DEFAULT_MIN_SPACING: Record<TickRole, number> = { major: 96, minor: 28 };

/**
 * Ticks covering the visible range for `unit`.
 * The first tick may start before the left edge so its cell is drawn partially.
 */
export function generateTicks(
  viewport: Viewport,
  unit: TickUnit,
  { role = 'minor', minSpacingPx, maxTicks = 1000 }: GenerateTicksOptions = {},
): Tick[] {
  if (viewport.widthPx <= 0) return [];

  const spacing = minSpacingPx ?? DEFAULT_MIN_SPACING[role];
  const step = chooseStep(unit, viewport.pxPerDay, spacing);
  const { from, to } = getVisibleRange(viewport);

  let date = startOfUnit(dayToLocalDate(from), unit);
  while (((unitIndex(date, unit) % step) + step) % step !== 0) {
    date = addUnits(date, unit, -1);
  }

  const ticks: Tick[] = [];
  let day = localDateToDay(date);

  while (day < to && ticks.length < maxTicks) {
    const next = addUnits(date, unit, step);
    const nextDay = localDateToDay(next);

    ticks.push({
      day,
      x: dayToX(day, viewport),
      endX: dayToX(nextDay, viewport),
      label: formatTickLabel(date, unit, role),
      unit,
    });

    date = next;
    day = nextDay;
  }

  return ticks;
}

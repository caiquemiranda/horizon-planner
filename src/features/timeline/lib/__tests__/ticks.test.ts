import { describe, expect, it } from 'vitest';

import type { ISODate } from '@/types/project';
import type { TickUnit, Viewport } from '@/types/timeline';

import { chooseStep, generateTicks, getGranularity, ZOOM_PRESETS } from '../ticks';
import { dayToLocalDate, isoDateToDay } from '../time';

const dayOf = (value: string) => isoDateToDay(value as ISODate);

function viewportAt(date: string, pxPerDay: number, widthPx = 1200): Viewport {
  return { startDay: dayOf(date), pxPerDay, widthPx };
}

describe('getGranularity', () => {
  it.each([
    [160, 'week', 'day'],
    [12, 'week', 'day'],
    [11.99, 'month', 'week'],
    [3, 'month', 'week'],
    [1, 'quarter', 'month'],
    [0.6, 'quarter', 'month'],
    [0.3, 'year', 'quarter'],
    [0.15, 'year', 'quarter'],
    [0.1, 'year', 'half'],
    [0.02, 'year', 'half'],
  ])('at %s px/day shows %s / %s', (pxPerDay, major, minor) => {
    expect(getGranularity(pxPerDay)).toMatchObject({ major, minor });
  });

  it('maps every zoom preset to a distinct band', () => {
    const bands = ZOOM_PRESETS.map((preset) => {
      const { major, minor } = getGranularity(preset.pxPerDay);
      return `${major}/${minor}`;
    });
    expect(new Set(bands).size).toBe(4);
  });
});

describe('chooseStep', () => {
  it('uses single units when there is room', () => {
    expect(chooseStep('month', 3, 28)).toBe(1);
  });

  it('merges cells that are too narrow', () => {
    expect(chooseStep('year', 0.02, 28)).toBe(5);
    expect(chooseStep('year', 0.02, 96)).toBe(25);
  });

  it('falls back to the largest step', () => {
    expect(chooseStep('quarter', 0.0001, 28)).toBe(4);
  });
});

describe('generateTicks', () => {
  it('produces contiguous month cells with real month lengths', () => {
    const ticks = generateTicks(viewportAt('2026-01-01', 3, 300), 'month');

    expect(ticks.map((tick) => tick.label)).toEqual(['jan', 'fev', 'mar', 'abr']);
    expect(ticks[0]?.x).toBe(0);
    expect(ticks[0]?.endX).toBe(31 * 3);
    expect(ticks[1]?.endX).toBe((31 + 28) * 3);

    ticks.slice(1).forEach((tick, index) => {
      expect(tick.x).toBe(ticks[index]?.endX);
    });
  });

  it('covers the whole viewport, starting at or before the left edge', () => {
    const viewport = viewportAt('2026-02-17', 5, 900);
    const units: TickUnit[] = ['year', 'half', 'quarter', 'month', 'week', 'day'];

    for (const unit of units) {
      const ticks = generateTicks(viewport, unit);
      expect(ticks[0]?.x).toBeLessThanOrEqual(0);
      expect(ticks.at(-1)?.endX).toBeGreaterThanOrEqual(viewport.widthPx);
    }
  });

  it('formats major labels with context', () => {
    const viewport = viewportAt('2026-01-01', 3, 100);

    expect(generateTicks(viewport, 'month', { role: 'major', minSpacingPx: 1 })[0]?.label).toBe(
      'Janeiro 2026',
    );
    expect(generateTicks(viewport, 'quarter', { role: 'major', minSpacingPx: 1 })[0]?.label).toBe(
      'T1 2026',
    );
  });

  it('labels quarters and halves', () => {
    const viewport = viewportAt('2026-01-01', 0.5, 365 * 0.5);

    expect(generateTicks(viewport, 'quarter', { minSpacingPx: 1 }).map((t) => t.label)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
    ]);
    expect(generateTicks(viewport, 'half', { minSpacingPx: 1 }).map((t) => t.label)).toEqual([
      'S1',
      'S2',
    ]);
  });

  it('starts weeks on Monday', () => {
    const ticks = generateTicks(viewportAt('2026-03-04', 6, 600), 'week', { minSpacingPx: 1 });

    expect(ticks.length).toBeGreaterThan(5);
    for (const tick of ticks) {
      expect(dayToLocalDate(tick.day).getDay()).toBe(1);
    }
  });

  it('keeps day cells exactly one day wide across DST', () => {
    const ticks = generateTicks(viewportAt('2026-03-05', 20, 200), 'day', { minSpacingPx: 1 });

    expect(ticks.map((tick) => tick.label)).toContain('8');
    for (const tick of ticks) {
      expect(tick.endX - tick.x).toBe(20);
    }
  });

  it('formats day labels in pt-BR', () => {
    const [tick] = generateTicks(viewportAt('2026-03-09', 100, 50), 'day', {
      role: 'major',
      minSpacingPx: 1,
    });
    expect(tick?.label).toBe('Seg, 9 mar');
  });

  it('abbreviates weekdays with accents correctly', () => {
    const [tick] = generateTicks(viewportAt('2026-03-14', 100, 50), 'day', {
      role: 'major',
      minSpacingPx: 1,
    });
    expect(tick?.label).toBe('Sáb, 14 mar');
  });

  it('merges narrow day cells into larger steps', () => {
    const ticks = generateTicks(viewportAt('2026-03-05', 20, 200), 'day');
    expect(ticks.every((tick) => tick.endX - tick.x === 40)).toBe(true);
  });

  it('aligns stepped ticks to round values', () => {
    const ticks = generateTicks(viewportAt('1990-01-01', 0.02), 'year', { minSpacingPx: 96 });

    expect(ticks.length).toBeGreaterThan(1);
    for (const tick of ticks) {
      expect(Number(tick.label) % 25).toBe(0);
    }
  });

  it('returns nothing for an empty viewport', () => {
    expect(generateTicks(viewportAt('2026-01-01', 3, 0), 'month')).toEqual([]);
  });

  it('respects the tick cap', () => {
    const ticks = generateTicks(viewportAt('2026-01-01', 1, 5000), 'day', {
      minSpacingPx: 0,
      maxTicks: 10,
    });
    expect(ticks).toHaveLength(10);
  });
});

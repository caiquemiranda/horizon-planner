import { describe, expect, it } from 'vitest';

import type { ISODate } from '@/types/project';

import { formatDate, formatDateRange, formatDuration } from '../format';

const iso = (value: string) => value as ISODate;

describe('formatDate', () => {
  it('uses short pt-BR month names', () => {
    expect(formatDate(iso('2026-03-09'))).toBe('9 mar 2026');
  });
});

describe('formatDateRange', () => {
  it('shows the month once when both dates share it', () => {
    expect(formatDateRange(iso('2026-03-11'), iso('2026-03-20'))).toBe('11 – 20 mar 2026');
  });

  it('omits the first year when both dates share it', () => {
    expect(formatDateRange(iso('2026-03-09'), iso('2026-04-20'))).toBe('9 mar – 20 abr 2026');
  });

  it('shows both years across a year boundary', () => {
    expect(formatDateRange(iso('2026-11-15'), iso('2027-02-03'))).toBe('15 nov 2026 – 3 fev 2027');
  });

  it('shows a single date for one-day ranges', () => {
    expect(formatDateRange(iso('2026-03-09'), iso('2026-03-09'))).toBe('9 mar 2026');
  });
});

describe('formatDuration', () => {
  it.each([
    ['2026-03-09', '2026-03-09', '1 dia'],
    ['2026-03-01', '2026-03-12', '12 dias'],
    ['2026-01-01', '2026-01-31', '31 dias'],
    ['2026-01-01', '2026-02-15', '2 meses'],
    ['2026-01-01', '2026-03-31', '3 meses'],
    ['2026-01-01', '2026-12-31', '1 ano'],
    ['2026-01-01', '2027-06-30', '1,5 ano'],
    ['2026-01-01', '2028-12-31', '3 anos'],
  ])('%s → %s = %s', (start, end, expected) => {
    expect(formatDuration(iso(start), iso(end))).toBe(expected);
  });
});

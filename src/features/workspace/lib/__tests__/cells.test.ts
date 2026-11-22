import { describe, expect, it } from 'vitest';

import { createWorkCalendar, DEFAULT_CALENDAR } from '@/features/schedule/lib/calendar';
import { isoDateToDay } from '@/features/timeline/lib/time';
import type { ISODate } from '@/types/project';
import type { ScheduledTask } from '@/types/schedule';

import {
  durationForFinish,
  formatCellDate,
  formatDuration,
  getTaskStatus,
  parseDateInput,
  parseDurationInput,
  parseProgressInput,
} from '../cells';

const day = (date: string) => isoDateToDay(date as ISODate);

function scheduled(overrides: Partial<ScheduledTask>): ScheduledTask {
  return {
    id: 'a',
    kind: 'task',
    start: day('2026-11-23'),
    finish: day('2026-11-25'),
    duration: 2,
    progress: 0,
    drivingDependencyId: null,
    issues: [],
    ...overrides,
  };
}

describe('cell parsing', () => {
  it('reads durations in pt-BR forms', () => {
    expect(parseDurationInput('3')).toEqual({ ok: true, value: 3 });
    expect(parseDurationInput(' 3d ')).toEqual({ ok: true, value: 3 });
    expect(parseDurationInput('1 dia')).toEqual({ ok: true, value: 1 });
    expect(parseDurationInput('10 dias')).toEqual({ ok: true, value: 10 });
    expect(parseDurationInput('0')).toEqual({ ok: true, value: 0 });
    expect(parseDurationInput('-1').ok).toBe(false);
    expect(parseDurationInput('2,5').ok).toBe(false);
  });

  it('reads progress with or without %', () => {
    expect(parseProgressInput('45%')).toEqual({ ok: true, value: 45 });
    expect(parseProgressInput('100')).toEqual({ ok: true, value: 100 });
    expect(parseProgressInput('101').ok).toBe(false);
  });

  it('accepts only real calendar dates', () => {
    expect(parseDateInput('2026-02-28')).toEqual({ ok: true, value: '2026-02-28' });
    expect(parseDateInput('2026-02-30').ok).toBe(false);
    expect(parseDateInput('').ok).toBe(false);
  });

  it('turns a new finish into a duration in working days', () => {
    const calendar = createWorkCalendar(DEFAULT_CALENDAR);
    // Monday 23 to Monday 30/11 = 6 working days.
    expect(durationForFinish(calendar, day('2026-11-23'), '2026-11-30' as ISODate)).toEqual({
      ok: true,
      value: 6,
    });
    expect(durationForFinish(calendar, day('2026-11-23'), '2026-11-20' as ISODate)).toEqual({
      ok: false,
      error: 'O término não pode ser anterior ao início.',
    });
  });
});

describe('formatting and status', () => {
  it('formats dates and durations', () => {
    expect(formatCellDate(day('2026-11-23'))).toBe('23/11/2026');
    expect(formatDuration(1)).toBe('1 dia');
    expect(formatDuration(0)).toBe('0 dias');
  });

  it('derives the status from progress and the last working day', () => {
    const today = day('2026-11-26');
    expect(getTaskStatus(scheduled({ progress: 100 }), today)).toBe('done');
    expect(getTaskStatus(scheduled({ progress: 50 }), today)).toBe('late');
    expect(
      getTaskStatus(
        scheduled({ start: day('2026-11-26'), finish: day('2026-11-28'), progress: 50 }),
        today,
      ),
    ).toBe('in_progress');
    expect(
      getTaskStatus(scheduled({ start: day('2026-12-01'), finish: day('2026-12-02') }), today),
    ).toBe('not_started');
  });
});

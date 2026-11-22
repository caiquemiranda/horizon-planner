import { describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import {
  countDays,
  createDefaultFormValues,
  type ProjectFormValues,
  suggestHorizon,
  toFormValues,
  validateForm,
} from '../form';

const TODAY = '2026-03-10' as ISODate;

function values(overrides: Partial<ProjectFormValues> = {}): ProjectFormValues {
  return { ...createDefaultFormValues(TODAY), title: 'Projeto', ...overrides };
}

describe('createDefaultFormValues', () => {
  it('starts today and lasts 30 days', () => {
    const defaults = createDefaultFormValues(TODAY);

    expect(defaults.startDate).toBe('2026-03-10');
    expect(defaults.endDate).toBe('2026-04-08');
    expect(countDays(defaults.startDate, defaults.endDate)).toBe(30);
    expect(defaults).toMatchObject({ horizon: 'short', status: 'planned', progress: 0 });
  });
});

describe('toFormValues', () => {
  it('turns a null category into an empty field', () => {
    expect(toFormValues(makeProject({ category: null })).category).toBe('');
    expect(toFormValues(makeProject({ category: 'Saúde' })).category).toBe('Saúde');
  });
});

describe('suggestHorizon', () => {
  it.each([
    ['2026-01-01', '2026-03-31', 'short'],
    ['2026-01-01', '2026-04-02', 'short'],
    ['2026-01-01', '2026-04-03', 'medium'],
    ['2026-01-01', '2027-01-01', 'medium'],
    ['2026-01-01', '2027-01-02', 'long'],
  ])('%s → %s is %s', (start, end, expected) => {
    expect(suggestHorizon(start, end)).toBe(expected);
  });

  it('returns null for incomplete or inverted ranges', () => {
    expect(suggestHorizon('', '2026-01-01')).toBeNull();
    expect(suggestHorizon('2026-02-01', '2026-01-01')).toBeNull();
  });
});

describe('validateForm', () => {
  it('returns a clean draft for valid values', () => {
    const result = validateForm(values({ category: '  Carreira  ' }));

    expect(result.success).toBe(true);
    expect(result.success && result.draft.category).toBe('Carreira');
  });

  it('maps an empty category to null', () => {
    const result = validateForm(values({ category: '   ' }));
    expect(result.success && result.draft.category).toBeNull();
  });

  it('reports field errors by path', () => {
    const result = validateForm(values({ title: '', startDate: '' }));

    expect(result.success).toBe(false);
    expect(result.errors.title).toBe('O título é obrigatório.');
    expect(result.errors.startDate).toMatch(/Data inválida/);
  });

  it('reports an inverted range even when other fields are invalid', () => {
    const result = validateForm(
      values({ title: '', startDate: '2026-05-10', endDate: '2026-05-01' }),
    );

    expect(result.errors.endDate).toMatch(/posterior/);
    expect(result.errors.title).toBeDefined();
  });

  it('reports milestones outside the project range', () => {
    const result = validateForm(
      values({
        milestones: [
          {
            id: '00000000-0000-4000-8000-0000000000aa',
            title: 'Entrega',
            date: '2027-01-01',
            completed: false,
          },
        ],
      }),
    );

    expect(result.errors['milestones.0.date']).toMatch(/entre as datas/);
  });
});

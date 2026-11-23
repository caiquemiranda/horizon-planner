import { describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';

import { getPlacement, selectByPlacement, selectNotTrashed } from '../visibility';

const AT = '2026-05-01T10:00:00.000Z';

describe('visibility', () => {
  const listed = makeProject({ title: 'Listado' });
  const hidden = makeProject({ title: 'Oculto', hiddenAt: AT });
  const trashed = makeProject({ title: 'Na lixeira', deletedAt: AT });
  const hiddenAndTrashed = makeProject({
    title: 'Oculto e na lixeira',
    status: 'completed',
    hiddenAt: AT,
    deletedAt: AT,
  });
  const all = [listed, hidden, trashed, hiddenAndTrashed];

  it('puts the trash first, then hidden, then listed, whatever the status', () => {
    expect(all.map(getPlacement)).toEqual(['listed', 'hidden', 'trash', 'trash']);
  });

  it('selects each placement in the original order', () => {
    expect(selectByPlacement(all, 'listed')).toEqual([listed]);
    expect(selectByPlacement(all, 'hidden')).toEqual([hidden]);
    expect(selectByPlacement(all, 'trash')).toEqual([trashed, hiddenAndTrashed]);
  });

  it('keeps hidden projects among the ones that still exist', () => {
    expect(selectNotTrashed(all)).toEqual([listed, hidden]);
  });
});

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { isoDateToDay } from '../../lib/time';
import { useViewportStore } from '../../store/viewportStore';
import { Timeline } from '../Timeline';

const MARCH_1 = isoDateToDay('2026-03-01' as ISODate);

function renderTimeline(projects = [makeProject()]) {
  const result = render(<Timeline projects={projects} />);
  // jsdom has no layout: provide the measured width by hand.
  act(() => {
    useViewportStore.setState({ viewport: { startDay: MARCH_1, pxPerDay: 10, widthPx: 1000 } });
  });
  return result;
}

describe('Timeline', () => {
  beforeEach(() => {
    useViewportStore.setState({ viewport: { startDay: MARCH_1, pxPerDay: 10, widthPx: 0 } });
  });

  it('shows the empty state without projects', () => {
    renderTimeline([]);

    expect(
      screen.getByRole('heading', { name: 'Sua linha do tempo está vazia' }),
    ).toBeInTheDocument();
  });

  it('positions a bar from the project dates', () => {
    renderTimeline([
      makeProject({
        title: 'Mudança',
        startDate: '2026-03-11' as ISODate,
        endDate: '2026-03-20' as ISODate,
      }),
    ]);

    const bar = screen.getByRole('button', { name: /Mudança/ });
    expect(bar.style.left).toBe('100px');
    expect(bar.style.width).toBe('100px');
  });

  it('lists projects by horizon in the sidebar', () => {
    renderTimeline([
      makeProject({ title: 'Curso de inglês', horizon: 'medium' }),
      makeProject({ title: 'Reforma', horizon: 'short' }),
    ]);

    const medium = screen.getByRole('list', { name: 'Projetos de médio prazo' });
    expect(within(medium).getByText('Curso de inglês')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /vazia/ })).not.toBeInTheDocument();
  });

  it('skips bars outside the visible range', () => {
    renderTimeline([
      makeProject({
        title: 'Ano que vem',
        startDate: '2027-06-01' as ISODate,
        endDate: '2027-07-01' as ISODate,
      }),
    ]);

    expect(screen.queryByRole('button', { name: /Ano que vem/ })).not.toBeInTheDocument();
  });

  it('collapses and expands a lane', async () => {
    const user = userEvent.setup();
    renderTimeline([makeProject({ title: 'Reforma', horizon: 'short' })]);

    const toggle = screen.getByRole('button', { name: /Curto prazo/ });
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Reforma/ })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /Reforma/ })).toBeInTheDocument();
  });

  it('draws milestones inside the bar', () => {
    renderTimeline([
      makeProject({
        title: 'Lançamento',
        startDate: '2026-03-11' as ISODate,
        endDate: '2026-03-30' as ISODate,
        milestones: [
          {
            id: '00000000-0000-4000-8000-0000000000aa',
            title: 'Beta',
            date: '2026-03-16' as ISODate,
            completed: false,
          },
        ],
      }),
    ]);

    const bar = screen.getByRole('button', { name: /Lançamento/ });
    const milestone = bar.querySelector<HTMLElement>('[data-milestone-id]');
    // 5.5 days after the start of the bar, at 10 px/day.
    expect(milestone?.style.left).toBe('55px');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';
import { ZOOM_LIMITS } from '@/types/timeline';

import { dayToX } from '../../lib/scale';
import { getTodayDay, isoDateToDay } from '../../lib/time';
import { ZOOM_STEP_FACTOR } from '../../lib/zoom';
import { useViewportStore } from '../../store/viewportStore';
import { TimelineToolbar } from '../TimelineToolbar';

const VIEWPORT = { startDay: 20_000, pxPerDay: 10, widthPx: 1000 };

function renderToolbar(projects = [makeProject()]) {
  return render(
    <TooltipProvider>
      <TimelineToolbar projects={projects} />
    </TooltipProvider>,
  );
}

function getViewport() {
  return useViewportStore.getState().viewport;
}

describe('TimelineToolbar', () => {
  beforeEach(() => {
    useViewportStore.getState().setViewport(VIEWPORT);
  });

  it('centers the timeline on today', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));

    expect(dayToX(getTodayDay(), getViewport())).toBeCloseTo(500, 0);
  });

  it('shows the visible date range', () => {
    // 2024-10-04 + 100 days at 10 px/day.
    renderToolbar();

    expect(screen.getByText('out 2024 – jan 2025')).toBeInTheDocument();
  });

  it('zooms in and out by one step around the center', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    expect(getViewport().pxPerDay).toBeCloseTo(10 * ZOOM_STEP_FACTOR);

    await user.click(screen.getByRole('button', { name: 'Diminuir zoom' }));
    expect(getViewport().pxPerDay).toBeCloseTo(10);
  });

  it('disables zoom buttons at the limits', () => {
    useViewportStore.getState().setViewport({ ...VIEWPORT, pxPerDay: ZOOM_LIMITS.max });
    renderToolbar();

    expect(screen.getByRole('button', { name: 'Aumentar zoom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toBeEnabled();
  });

  it('shows the nearest preset and applies a new one', async () => {
    const user = userEvent.setup();
    renderToolbar();

    const trigger = screen.getByRole('button', { name: 'Nível de zoom: Meses' });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitemradio', { name: 'Anos' }));

    expect(getViewport().pxPerDay).toBe(0.33);
    expect(screen.getByRole('button', { name: 'Nível de zoom: Anos' })).toBeInTheDocument();
  });

  it('fits every project in view', async () => {
    const user = userEvent.setup();
    renderToolbar([
      makeProject({ startDate: '2026-01-01' as ISODate, endDate: '2026-03-31' as ISODate }),
      makeProject({ startDate: '2026-06-01' as ISODate, endDate: '2026-12-31' as ISODate }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Ajustar todos os projetos' }));

    const viewport = getViewport();
    expect(dayToX(isoDateToDay('2026-01-01' as ISODate), viewport)).toBeGreaterThanOrEqual(0);
    expect(dayToX(isoDateToDay('2027-01-01' as ISODate), viewport)).toBeLessThanOrEqual(1000);
  });

  it('disables "fit" without projects', () => {
    renderToolbar([]);

    expect(screen.getByRole('button', { name: 'Ajustar todos os projetos' })).toBeDisabled();
  });
});

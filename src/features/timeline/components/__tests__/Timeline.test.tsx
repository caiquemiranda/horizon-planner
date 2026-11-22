import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { isoDateToDay } from '../../lib/time';
import { useViewportStore } from '../../store/viewportStore';
import { Timeline } from '../Timeline';

const MARCH_1 = isoDateToDay('2026-03-01' as ISODate);

function renderTimeline(projects = [makeProject()]) {
  const result = render(
    <TooltipProvider delayDuration={0}>
      <Timeline projects={projects} />
    </TooltipProvider>,
  );
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

    const bar = screen.getByRole('button', { name: /Mudança/, pressed: false });
    expect(bar.style.left).toBe('100px');
    expect(bar.style.width).toBe('100px');
  });

  it('describes each bar for screen readers', () => {
    renderTimeline([
      makeProject({
        title: 'Mudança',
        status: 'paused',
        startDate: '2026-03-11' as ISODate,
        endDate: '2026-03-20' as ISODate,
        progress: 20,
      }),
    ]);

    expect(
      screen.getByRole('button', { name: 'Mudança', pressed: false }),
    ).toHaveAccessibleDescription('Pausado, 11 – 20 mar 2026, 20% concluído');
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

    expect(
      screen.queryByRole('button', { name: /Ano que vem/, pressed: false }),
    ).not.toBeInTheDocument();
  });

  it('collapses and expands a lane', async () => {
    const user = userEvent.setup();
    renderTimeline([makeProject({ title: 'Reforma', horizon: 'short' })]);

    const toggle = screen.getByRole('button', { name: /Curto prazo/ });
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: /Reforma/, pressed: false }),
    ).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('button', { name: /Reforma/, pressed: false })).toBeInTheDocument();
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

    const bar = screen.getByRole('button', { name: /Lançamento/, pressed: false });
    const milestone = bar.querySelector<HTMLElement>('[data-milestone-id]');
    // 5.5 days after the start of the bar, at 10 px/day.
    expect(milestone?.style.left).toBe('55px');
  });

  it('shows the project summary in a tooltip on hover', async () => {
    const user = userEvent.setup();
    renderTimeline([
      makeProject({
        title: 'Mudança',
        status: 'in_progress',
        startDate: '2026-03-11' as ISODate,
        endDate: '2026-03-20' as ISODate,
        progress: 40,
      }),
    ]);

    await user.hover(screen.getByRole('button', { name: /Mudança/, pressed: false }));

    await screen.findByRole('tooltip');
    const tooltip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveTextContent('11 – 20 mar 2026');
    expect(tooltip).toHaveTextContent('10 dias');
    expect(tooltip).toHaveTextContent('Em andamento');
    expect(tooltip).toHaveTextContent('40%');
  });

  it('highlights the same project in the sidebar and on the canvas', async () => {
    const user = userEvent.setup();
    renderTimeline([makeProject({ title: 'Reforma' })]);

    const bar = screen.getByRole('button', { name: /Reforma/, pressed: false });
    const row = screen.getByText('Reforma', { selector: 'li span' }).closest('li');

    await user.hover(bar);
    expect(bar).toHaveAttribute('data-highlighted');
    expect(row).toHaveAttribute('data-highlighted');

    await user.unhover(bar);
    expect(row).not.toHaveAttribute('data-highlighted');
  });

  it('clips the canvas without making it scrollable', () => {
    renderTimeline();

    // A scrollable canvas drifts away from the ruler when a bar receives focus.
    const canvas = screen.getByRole('region', { name: 'Linha do tempo' });
    expect(canvas).toHaveClass('overflow-clip');
    expect(canvas).not.toHaveClass('overflow-hidden');
  });

  it('zooms on Ctrl + wheel and leaves plain scrolling alone', () => {
    renderTimeline();
    const canvas = screen.getByRole('region', { name: 'Linha do tempo' });

    const zoom = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    canvas.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    expect(useViewportStore.getState().viewport.pxPerDay).toBeGreaterThan(10);

    const scroll = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    canvas.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it('pans when dragging and swallows the click that ends the drag', () => {
    renderTimeline([makeProject({ title: 'Reforma' })]);
    const canvas = screen.getByRole('region', { name: 'Linha do tempo' });
    const bar = screen.getByRole('button', { name: /Reforma/, pressed: false });
    canvas.setPointerCapture = () => undefined;
    const onClick = vi.fn();
    canvas.addEventListener('click', onClick);

    const pointer = { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true };
    fireEvent.pointerDown(bar, { ...pointer, clientX: 300, clientY: 10 });
    fireEvent.pointerMove(bar, { ...pointer, clientX: 280, clientY: 10 });
    expect(canvas).toHaveAttribute('data-panning');
    fireEvent.pointerMove(bar, { ...pointer, clientX: 200, clientY: 10 });
    fireEvent.pointerUp(bar, { ...pointer, clientX: 200, clientY: 10 });
    fireEvent.click(bar);

    // 100 px to the left at 10 px/day = 10 days forward.
    expect(useViewportStore.getState().viewport.startDay).toBeCloseTo(MARCH_1 + 10);
    expect(canvas).not.toHaveAttribute('data-panning');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a short press as a normal click', () => {
    renderTimeline([makeProject({ title: 'Reforma' })]);
    const canvas = screen.getByRole('region', { name: 'Linha do tempo' });
    const bar = screen.getByRole('button', { name: /Reforma/, pressed: false });
    const onClick = vi.fn();
    canvas.addEventListener('click', onClick);

    const pointer = { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true };
    fireEvent.pointerDown(bar, { ...pointer, clientX: 300, clientY: 10 });
    fireEvent.pointerMove(bar, { ...pointer, clientX: 302, clientY: 11 });
    fireEvent.pointerUp(bar, { ...pointer, clientX: 302, clientY: 11 });
    fireEvent.click(bar);

    expect(useViewportStore.getState().viewport.startDay).toBe(MARCH_1);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('selects a project from its bar or its sidebar row', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Reforma' });
    const onSelectProject = vi.fn();
    render(
      <TooltipProvider>
        <Timeline projects={[project]} selectedProjectId={null} onSelectProject={onSelectProject} />
      </TooltipProvider>,
    );
    act(() => {
      useViewportStore.setState({ viewport: { startDay: MARCH_1, pxPerDay: 10, widthPx: 1000 } });
    });

    await user.click(screen.getByRole('button', { name: 'Reforma', pressed: false }));
    await user.click(screen.getByText('Reforma', { selector: 'li button span' }));

    expect(onSelectProject).toHaveBeenNthCalledWith(1, project.id);
    expect(onSelectProject).toHaveBeenNthCalledWith(2, project.id);
  });

  it('marks the selected project', () => {
    const project = makeProject({ title: 'Reforma' });
    render(
      <TooltipProvider>
        <Timeline projects={[project]} selectedProjectId={project.id} />
      </TooltipProvider>,
    );
    act(() => {
      useViewportStore.setState({ viewport: { startDay: MARCH_1, pxPerDay: 10, widthPx: 1000 } });
    });

    expect(screen.getByRole('button', { name: 'Reforma', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('Reforma');
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import {
  DEFAULT_SPLIT_WIDTH,
  useWorkspaceUiStore,
} from '@/features/workspace/store/workspaceUiStore';
import { projectHref } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const project = makeProject({
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Implantação de Sistema Industrial',
});
const schedule = createIndustrialSchedule({
  projectId: project.id,
  start: '2026-11-23' as ISODate,
  generateId: (key) => `t-${key}`,
});

// jsdom has no layout: give every element a width so the chart can fit the schedule.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200,
  });
});
afterAll(() => {
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
});

async function openGantt() {
  window.location.hash = projectHref(project.id);
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
  await screen.findByRole('treegrid');
  return screen.getByRole('region', { name: 'Gráfico de Gantt' });
}

const bar = (id: string) => document.querySelector<HTMLElement>(`[data-bar-id="${id}"]`);

describe('Gantt chart', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await projectRepository.replaceAll([project]);
    await scheduleRepository.replaceAll([schedule]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
  });

  it('draws one shape per visible task, by kind', async () => {
    await openGantt();

    expect(bar('t-A')).toHaveAttribute('data-kind', 'task');
    expect(bar('t-eng')).toHaveAttribute('data-kind', 'summary');
    expect(bar('t-M')).toHaveAttribute('data-kind', 'milestone');
    expect(document.querySelectorAll('[data-bar-id]')).toHaveLength(schedule.tasks.length);
  });

  it('places bars on the same rows as the table and at their dates', async () => {
    await openGantt();
    const a = bar('t-A');
    const b = bar('t-B');
    if (!a || !b) throw new Error('bars missing');

    // A is the 2nd row and B the 3rd: centers 36 px apart, like the table rows.
    expect(parseFloat(b.style.top) - parseFloat(a.style.top)).toBe(36);
    // B starts where A ends (FS, no weekend in between).
    expect(parseFloat(b.style.left)).toBeCloseTo(
      parseFloat(a.style.left) + parseFloat(a.style.width),
    );
    // The summary spans from A's start to C's end.
    const phase = bar('t-eng');
    const c = bar('t-C');
    if (!phase || !c) throw new Error('bars missing');
    expect(parseFloat(phase.style.left)).toBeCloseTo(parseFloat(a.style.left));
    expect(parseFloat(phase.style.left) + parseFloat(phase.style.width)).toBeCloseTo(
      parseFloat(c.style.left) + parseFloat(c.style.width),
    );
  });

  it('hides the bars of a collapsed phase and shows them again', async () => {
    const user = userEvent.setup();
    await openGantt();

    await user.click(screen.getByRole('button', { name: 'Recolher Engenharia' }));
    expect(bar('t-A')).toBeNull();
    expect(bar('t-eng')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Expandir Engenharia' }));
    expect(bar('t-A')).not.toBeNull();
  });

  it('moves the successors bars when a duration changes in the table', async () => {
    const user = userEvent.setup();
    await openGantt();
    const before = parseFloat(bar('t-B')?.style.left ?? '0');

    const row = screen
      .getAllByRole('row')
      .find((item) => within(item).queryByText('Levantamento técnico'));
    if (!row) throw new Error('row missing');
    const duration = within(row).getAllByRole('gridcell')[2];
    if (!duration) throw new Error('cell missing');
    await user.dblClick(duration);
    await user.keyboard('{Control>}a{/Control}4{Enter}');

    expect(parseFloat(bar('t-B')?.style.left ?? '0')).toBeGreaterThan(before);
  });

  it('resizes the split with the keyboard and remembers it', async () => {
    const user = userEvent.setup();
    await openGantt();
    const separator = screen.getByRole('separator', { name: 'Redimensionar tabela e gráfico' });
    expect(separator).toHaveAttribute('aria-valuenow', String(DEFAULT_SPLIT_WIDTH));

    separator.focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(separator).toHaveAttribute('aria-valuenow', String(DEFAULT_SPLIT_WIDTH - 48));
    expect(useWorkspaceUiStore.getState().splitWidth).toBe(DEFAULT_SPLIT_WIDTH - 48);
  });

  it('zooms with the toolbar without changing any task', async () => {
    const user = userEvent.setup();
    await openGantt();
    const width = parseFloat(bar('t-A')?.style.width ?? '0');

    await user.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    await waitFor(() => {
      expect(parseFloat(bar('t-A')?.style.width ?? '0')).toBeGreaterThan(width);
    });
    // Nothing was saved: zoom is presentation only.
    expect((await scheduleRepository.get(project.id))?.revision).toBe(schedule.revision);
  });
});

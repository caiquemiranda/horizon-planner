import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import { useWorkspaceUiStore } from '@/features/workspace/store/workspaceUiStore';
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

const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200,
  });
  HTMLElement.prototype.setPointerCapture = () => undefined;
});
afterAll(() => {
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function openWorkspace() {
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
}

function row(name: string) {
  const found = screen
    .getAllByRole('row')
    .find((item) => within(item).queryByText(name, { exact: true }));
  if (!found) throw new Error(`Row "${name}" not found`);
  return found;
}

function cell(name: string, column: number) {
  const found = within(row(name)).getAllByRole('gridcell')[column];
  if (!found) throw new Error('cell missing');
  return found;
}

/** jsdom has no layout: give an element a box. */
function placeAt(
  element: Element,
  box: { left: number; top: number; width: number; height: number },
) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...box,
    x: box.left,
    y: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
    toJSON: () => box,
  });
}

describe('editing on the chart and the table', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await projectRepository.replaceAll([project]);
    await scheduleRepository.replaceAll([schedule]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
    useNoticeStore.getState().dismiss();
  });

  it('moves a bar by dragging it, updating the table on release', async () => {
    await openWorkspace();
    const bar = document.querySelector<HTMLElement>('[data-bar-id="t-T"]');
    if (!bar) throw new Error('bar missing');
    // "Treinamento" is Mon 23 – Wed 25: three days wide.
    const pxPerDay = parseFloat(bar.style.width) / 3;
    placeAt(bar, { left: 100, top: 0, width: pxPerDay * 3, height: 20 });

    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };
    fireEvent.pointerDown(bar, { ...pointer, clientX: 100 + pxPerDay });
    fireEvent.pointerMove(window, { ...pointer, clientX: 100 + pxPerDay * 3 });
    expect(await screen.findByTestId('bar-drag-preview')).toBeInTheDocument();
    // Nothing is saved while dragging.
    expect(cell('Treinamento da equipe', 3)).toHaveTextContent('23/11/2026');
    fireEvent.pointerUp(window, { ...pointer, clientX: 100 + pxPerDay * 3 });

    expect(cell('Treinamento da equipe', 3)).toHaveTextContent('25/11/2026');
    expect(cell('Treinamento da equipe', 2)).toHaveTextContent('3 dias');
    expect(screen.queryByTestId('bar-drag-preview')).not.toBeInTheDocument();
  });

  it('resizes a bar from its finish edge, counting working days', async () => {
    await openWorkspace();
    const bar = document.querySelector<HTMLElement>('[data-bar-id="t-T"]');
    if (!bar) throw new Error('bar missing');
    const pxPerDay = parseFloat(bar.style.width) / 3;
    placeAt(bar, { left: 100, top: 0, width: pxPerDay * 3, height: 20 });

    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };
    const edge = 100 + pxPerDay * 3 - 2;
    fireEvent.pointerDown(bar, { ...pointer, clientX: edge });
    // Wed 25 → Mon 30: Thu, Fri, (weekend), Mon = three more working days.
    fireEvent.pointerMove(window, { ...pointer, clientX: edge + pxPerDay * 5 });
    fireEvent.pointerUp(window, { ...pointer, clientX: edge + pxPerDay * 5 });

    expect(cell('Treinamento da equipe', 2)).toHaveTextContent('6 dias');
    expect(cell('Treinamento da equipe', 4)).toHaveTextContent('30/11/2026');
  });

  it('cancels a drag with Esc', async () => {
    await openWorkspace();
    const bar = document.querySelector<HTMLElement>('[data-bar-id="t-T"]');
    if (!bar) throw new Error('bar missing');
    const pxPerDay = parseFloat(bar.style.width) / 3;
    placeAt(bar, { left: 100, top: 0, width: pxPerDay * 3, height: 20 });

    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };
    fireEvent.pointerDown(bar, { ...pointer, clientX: 120 });
    fireEvent.pointerMove(window, { ...pointer, clientX: 120 + pxPerDay * 4 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { ...pointer, clientX: 120 + pxPerDay * 4 });

    expect(cell('Treinamento da equipe', 3)).toHaveTextContent('23/11/2026');
  });

  it('explains when a link keeps an automatic task from moving earlier', async () => {
    await openWorkspace();
    const bar = document.querySelector<HTMLElement>('[data-bar-id="t-B"]');
    if (!bar) throw new Error('bar missing');
    const pxPerDay = parseFloat(bar.style.width) / 3;
    placeAt(bar, { left: 300, top: 0, width: pxPerDay * 3, height: 20 });

    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };
    fireEvent.pointerDown(bar, { ...pointer, clientX: 320 });
    fireEvent.pointerMove(window, { ...pointer, clientX: 320 - pxPerDay * 2 });
    fireEvent.pointerUp(window, { ...pointer, clientX: 320 - pxPerDay * 2 });

    expect(
      await screen.findByText(
        /1.2 Desenvolvimento do projeto não pode começar antes de 25\/11\/2026: depende de 1.1/,
      ),
    ).toBeInTheDocument();
    expect(cell('Desenvolvimento do projeto', 3)).toHaveTextContent('25/11/2026');
  });

  it('reorders a row by dragging its grip', async () => {
    await openWorkspace();
    const grip = row('Treinamento da equipe').querySelector('[data-row-grip]');
    const target = row('Instalação');
    if (!grip) throw new Error('grip missing');
    placeAt(target, { left: 0, top: 400, width: 600, height: 36 });
    // jsdom has no hit testing: the pointer is over the target row.
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    });

    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };
    fireEvent.pointerDown(grip, pointer);
    fireEvent.pointerMove(window, { ...pointer, clientX: 100, clientY: 402 });
    expect(target.className).toContain('shadow-[inset_0_2px_0_var(--ring)]');
    fireEvent.pointerUp(window, pointer);

    expect(cell('Treinamento da equipe', 0)).toHaveTextContent('3.1');
    expect(cell('Instalação', 0)).toHaveTextContent('3.2');
  });

  it('hides a column and remembers it per project', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.click(screen.getByRole('button', { name: 'Colunas da tabela' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Responsável' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('columnheader', { name: 'Responsável' })).not.toBeInTheDocument();
    expect(useWorkspaceUiStore.getState().hiddenColumns).toEqual(['assignee']);
    useWorkspaceUiStore.getState().load(project.id);
    expect(useWorkspaceUiStore.getState().hiddenColumns).toEqual(['assignee']);
  });

  it('resizes a column from its header edge', async () => {
    await openWorkspace();
    const header = screen.getByRole('columnheader', { name: 'Nome da tarefa' });
    const resizer = header.querySelector('[data-column-resizer]');
    if (!resizer) throw new Error('resizer missing');

    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };
    fireEvent.pointerDown(resizer, { ...pointer, clientX: 300 });
    fireEvent.pointerMove(resizer, { ...pointer, clientX: 360 });
    fireEvent.pointerUp(resizer, pointer);

    expect(useWorkspaceUiStore.getState().columnWidths.name).toBe(360);
  });
});

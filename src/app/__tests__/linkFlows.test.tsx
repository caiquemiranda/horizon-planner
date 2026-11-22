import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = () => undefined;
});
afterAll(() => {
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
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

const connectors = () =>
  [...document.querySelectorAll<SVGGElement>('[data-link-id]')].map((g) => g.dataset.linkId);

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

describe('dependency links', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await projectRepository.replaceAll([project]);
    await scheduleRepository.replaceAll([schedule]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
    useNoticeStore.getState().dismiss();
  });

  it('draws one connector per stored link, with an arrowhead', async () => {
    await openWorkspace();
    expect(connectors()).toHaveLength(schedule.dependencies.length);
    const link = document.querySelector('[data-link-id="t-A-B"]');
    expect(link?.querySelector('polygon')).not.toBeNull();
    expect(link).toHaveAttribute('data-link-type', 'FS');
  });

  it('hides connectors with an end in a collapsed phase and keeps the links', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.click(screen.getByRole('button', { name: 'Recolher Suprimentos' }));
    // C→D, D→E and E→F have an end inside "Suprimentos".
    expect(connectors()).toHaveLength(schedule.dependencies.length - 3);
    expect(connectors()).not.toContain('t-C-D');
    expect((await scheduleRepository.get(project.id))?.dependencies).toHaveLength(8);

    await user.click(screen.getByRole('button', { name: 'Expandir Suprimentos' }));
    expect(connectors()).toContain('t-C-D');
  });

  it('opens the link from its connector and changes its type and lag', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    const hitArea = document.querySelectorAll('[data-link-id="t-A-B"] path')[1];
    if (!hitArea) throw new Error('hit area missing');
    await user.click(hitArea);

    const dialog = await screen.findByRole('dialog', { name: /Vínculos de “1.2/ });
    const type = within(dialog).getByRole('combobox', { name: /Tipo do vínculo com 1.1/ });
    expect(type).toHaveFocus();
    await user.selectOptions(type, 'SS');
    const lag = within(dialog).getByRole('spinbutton', {
      name: /Atraso em dias úteis do vínculo com 1.1/,
    });
    await user.clear(lag);
    await user.type(lag, '1{Enter}');
    await user.keyboard('{Escape}');

    expect(cell('Desenvolvimento do projeto', 5)).toHaveTextContent('1.1SS+1d');
    expect(document.querySelector('[data-link-id="t-A-B"]')).toHaveAttribute(
      'data-link-type',
      'SS',
    );
  });

  it('adds and removes links from the dialog, refusing cycles', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.click(cell('Treinamento da equipe', 1));
    await user.click(screen.getByRole('button', { name: 'Vínculos da tarefa' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Nenhuma predecessora: a tarefa começa na data definida.'),
    ).toBeInTheDocument();

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Adicionar sucessora: tarefa' }),
      't-M',
    );
    await user.click(
      within(within(dialog).getByRole('form', { name: 'Adicionar sucessora' })).getByRole(
        'button',
        { name: 'Adicionar' },
      ),
    );
    expect(
      within(dialog).getByRole('button', { name: /Excluir vínculo com 4.1 Aceite final/ }),
    ).toBeInTheDocument();
    expect(connectors()).toHaveLength(9);

    await user.click(within(dialog).getByRole('button', { name: /Excluir vínculo com 4.1/ }));
    expect(connectors()).toHaveLength(8);
    await user.keyboard('{Escape}');

    // Aceite final already comes after Levantamento técnico: linking back is circular.
    await user.click(cell('Aceite final', 1));
    await user.click(screen.getByRole('button', { name: 'Vínculos da tarefa' }));
    const second = await screen.findByRole('dialog');
    await user.selectOptions(
      within(second).getByRole('combobox', { name: 'Adicionar sucessora: tarefa' }),
      't-A',
    );
    await user.click(
      within(within(second).getByRole('form', { name: 'Adicionar sucessora' })).getByRole(
        'button',
        { name: 'Adicionar' },
      ),
    );
    expect(within(second).getByRole('alert')).toHaveTextContent('Vínculo circular');
    expect(connectors()).toHaveLength(8);
  });

  it('explains why summary tasks have no links', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(cell('Engenharia', 1));
    expect(screen.getByRole('button', { name: 'Vínculos da tarefa' })).toBeDisabled();
  });

  it('creates a link by dragging from a bar end to another task', async () => {
    await openWorkspace();
    const content = document.querySelector<HTMLElement>(
      '[data-testid=gantt-body] .will-change-transform',
    );
    if (!content) throw new Error('chart content missing');
    // Rows: 0 Engenharia, 1 A, … 11 Treinamento (index 11), 13 Aceite final.
    const rowY = (index: number) => index * 36 + 18;
    fireEvent.mouseMove(content, { clientX: 100, clientY: rowY(11) });

    const handle = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-link-handle="finish"]');
      if (!found) throw new Error('handle not shown');
      return found;
    });
    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };
    fireEvent.pointerDown(handle, { ...pointer, clientX: 100, clientY: rowY(11) });
    fireEvent.pointerMove(handle, { ...pointer, clientX: 900, clientY: rowY(13) });
    expect(screen.getByTestId('link-preview')).toBeInTheDocument();
    fireEvent.pointerUp(handle, { ...pointer, clientX: 900, clientY: rowY(13) });

    expect(
      await screen.findByText(/Vínculo criado: 3.4 Treinamento da equipe → 4.1 Aceite final/),
    ).toBeInTheDocument();
    expect(connectors()).toHaveLength(9);
    await waitFor(async () => {
      expect((await scheduleRepository.get(project.id))?.dependencies).toHaveLength(9);
    });
  });
});

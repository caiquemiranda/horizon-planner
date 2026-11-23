import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import { useWorkspaceUiStore } from '@/features/workspace/store/workspaceUiStore';
import { projectHref } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import type { ISODate, Project } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const openProject = makeProject({
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Implantação de Sistema Industrial',
  status: 'in_progress',
});
const closedProject = makeProject({
  id: '00000000-0000-4000-8000-000000000002',
  title: 'Projeto encerrado',
  status: 'completed',
});

function scheduleFor(project: Project) {
  return createIndustrialSchedule({
    projectId: project.id,
    start: '2026-11-23' as ISODate,
    generateId: (key) => `${project.id.slice(-1)}-${key}`,
  });
}

async function openWorkspace(project: Project) {
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

function cell(name: string, column: number) {
  const row = screen
    .getAllByRole('row')
    .find((item) => within(item).queryByText(name, { exact: true }));
  if (!row) throw new Error(`Row "${name}" not found`);
  const found = within(row).getAllByRole('gridcell')[column];
  if (!found) throw new Error('cell missing');
  return found;
}

describe('workspace robustness', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await projectRepository.replaceAll([openProject, closedProject]);
    await scheduleRepository.replaceAll([scheduleFor(openProject), scheduleFor(closedProject)]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
    useNoticeStore.getState().dismiss();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('read-only access', () => {
    it('opens a closed project read-only and explains how to edit', async () => {
      const user = userEvent.setup();
      await openWorkspace(closedProject);

      expect(
        screen.getByText(/Projeto concluído: o cronograma está somente para leitura/),
      ).toBeInTheDocument();
      expect(screen.getByRole('treegrid')).toHaveAttribute('aria-readonly', 'true');
      expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeDisabled();
      expect(document.querySelector('[data-row-grip]')).toBeNull();

      await user.dblClick(cell('Levantamento técnico', 2));
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows links and the calendar without editing controls', async () => {
      const user = userEvent.setup();
      await openWorkspace(closedProject);

      await user.click(cell('Desenvolvimento do projeto', 1));
      await user.click(screen.getByRole('button', { name: 'Vínculos da tarefa' }));
      const links = await screen.findByRole('dialog');
      expect(within(links).getByText('1.1 Levantamento técnico')).toBeInTheDocument();
      expect(within(links).queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument();
      expect(within(links).queryByRole('combobox')).not.toBeInTheDocument();
      await user.keyboard('{Escape}');

      await user.click(screen.getByRole('button', { name: 'Calendário do projeto' }));
      const calendar = await screen.findByRole('dialog', { name: 'Calendário do projeto' });
      expect(
        within(calendar).queryByRole('button', { name: 'Salvar calendário' }),
      ).not.toBeInTheDocument();
      expect(within(calendar).getByRole('checkbox', { name: 'Segunda-feira' })).toBeDisabled();
    });

    it('refuses changes even when called directly, and allows them once reopened', async () => {
      await openWorkspace(closedProject);
      const result = useScheduleStore.getState().apply((schedule) => ({ ...schedule, tasks: [] }));
      expect(result.ok).toBe(false);

      await act(async () => {
        await useProjectsStore
          .getState()
          .transition(closedProject.id, { action: 'reopen', reason: null });
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeEnabled();
      });
      expect(screen.queryByText(/somente para leitura/)).not.toBeInTheDocument();
    });
  });

  describe('project calendar', () => {
    it('reschedules tasks around a new holiday', async () => {
      const user = userEvent.setup();
      await openWorkspace(openProject);
      expect(cell('Desenvolvimento do projeto', 3)).toHaveTextContent('25/11/2026');

      await user.click(screen.getByRole('button', { name: 'Calendário do projeto' }));
      const dialog = await screen.findByRole('dialog', { name: 'Calendário do projeto' });
      await user.type(within(dialog).getByLabelText('Data do feriado'), '2026-11-24');
      await user.type(within(dialog).getByLabelText('Nome do feriado'), 'Ponto facultativo');
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar feriado' }));
      expect(within(dialog).getByText('Ponto facultativo')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Salvar calendário' }));

      // A (2 days) now takes Monday and Wednesday: B starts on Thursday 26.
      expect(cell('Levantamento técnico', 4)).toHaveTextContent('25/11/2026');
      expect(cell('Desenvolvimento do projeto', 3)).toHaveTextContent('26/11/2026');
      await waitFor(async () => {
        expect((await scheduleRepository.get(openProject.id))?.calendar.holidays).toEqual([
          { date: '2026-11-24', name: 'Ponto facultativo' },
        ]);
      });
    });

    it('counts Saturdays when they become working days', async () => {
      const user = userEvent.setup();
      await openWorkspace(openProject);

      await user.click(screen.getByRole('button', { name: 'Calendário do projeto' }));
      const dialog = await screen.findByRole('dialog', { name: 'Calendário do projeto' });
      await user.click(within(dialog).getByRole('checkbox', { name: 'Sábado' }));
      await user.click(within(dialog).getByRole('button', { name: 'Salvar calendário' }));

      // B (Wed 25 – Fri 27) is followed by C on Saturday 28.
      expect(cell('Aprovação técnica', 3)).toHaveTextContent('28/11/2026');
    });

    it('requires at least one working day', async () => {
      const user = userEvent.setup();
      await openWorkspace(openProject);

      await user.click(screen.getByRole('button', { name: 'Calendário do projeto' }));
      const dialog = await screen.findByRole('dialog', { name: 'Calendário do projeto' });
      for (const day of [
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
      ]) {
        await user.click(within(dialog).getByRole('checkbox', { name: day }));
      }
      await user.click(within(dialog).getByRole('button', { name: 'Salvar calendário' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('pelo menos um dia útil');
    });
  });

  it('warns before leaving while a save has failed', async () => {
    const user = userEvent.setup();
    vi.spyOn(scheduleRepository, 'save').mockRejectedValue(new Error('offline'));
    await openWorkspace(openProject);

    await user.dblClick(cell('Levantamento técnico', 1));
    await user.keyboard('{Control>}a{/Control}Levantamento{Enter}');
    await screen.findByText('Erro ao salvar');

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

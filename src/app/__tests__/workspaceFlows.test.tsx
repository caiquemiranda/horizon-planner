import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import { useWorkspaceUiStore } from '@/features/workspace/store/workspaceUiStore';
import { PORTFOLIO_HREF, projectHref } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const industrial = makeProject({
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Implantação de Sistema Industrial',
  startDate: '2026-11-23' as ISODate,
  endDate: '2026-12-23' as ISODate,
});
const empty = makeProject({ id: '00000000-0000-4000-8000-000000000002', title: 'Projeto vazio' });

const schedule = createIndustrialSchedule({
  projectId: industrial.id,
  start: '2026-11-23' as ISODate,
  generateId: (key) => `t-${key}`,
});

async function renderAt(hash: string) {
  window.location.hash = hash;
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
}

async function openWorkspace(projectId = industrial.id) {
  await renderAt(projectHref(projectId));
  return screen.findByRole('treegrid');
}

function row(name: string) {
  return screen.getAllByRole('row').find((item) => within(item).queryByText(name, { exact: true }));
}

function cell(name: string, column: number) {
  const target = row(name);
  if (!target) throw new Error(`Row "${name}" not found`);
  const found = within(target).getAllByRole('gridcell')[column];
  if (!found) throw new Error(`Column ${String(column)} not found`);
  return found;
}

describe('project workspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    window.localStorage.clear();
    await projectRepository.replaceAll([industrial, empty]);
    await scheduleRepository.replaceAll([schedule]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.getState().close();
    useNoticeStore.getState().dismiss();
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
    window.location.hash = '';
  });

  it('opens the project screen from the portfolio drawer and goes back', async () => {
    const user = userEvent.setup();
    await renderAt(PORTFOLIO_HREF);

    await user.click(screen.getByText(industrial.title, { selector: 'li button span' }));
    await user.click(await screen.findByRole('link', { name: 'Abrir cronograma' }));

    expect(
      await screen.findByRole('treegrid', { name: `Tarefas de ${industrial.title}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: industrial.title })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Portfólio/ }));
    expect(await screen.findByRole('region', { name: 'Linha do tempo' })).toBeInTheDocument();
  });

  it('shows the hierarchy with WBS numbers and computed dates', async () => {
    await openWorkspace();

    expect(cell('Engenharia', 0)).toHaveTextContent('1');
    expect(cell('Aprovação técnica', 0)).toHaveTextContent('1.3');
    expect(row('Engenharia')).toHaveAttribute('aria-level', '1');
    expect(row('Levantamento técnico')).toHaveAttribute('aria-level', '2');
    // B starts after A (Mon–Tue) and C after B, across the weekend (spec 13.1).
    expect(cell('Desenvolvimento do projeto', 3)).toHaveTextContent('25/11/2026');
    expect(cell('Aprovação técnica', 3)).toHaveTextContent('30/11/2026');
    expect(cell('Desenvolvimento do projeto', 5)).toHaveTextContent('1.1');
    // Summary values are derived and read-only.
    expect(cell('Engenharia', 2)).toHaveAttribute('aria-readonly', 'true');
  });

  it('edits a duration in the table and reschedules the successors', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.dblClick(cell('Levantamento técnico', 2));
    const input = screen.getByRole('textbox', { name: 'Duração de 1.1 Levantamento técnico' });
    await user.clear(input);
    await user.type(input, '3{Enter}');

    expect(cell('Levantamento técnico', 2)).toHaveTextContent('3 dias');
    expect(cell('Desenvolvimento do projeto', 3)).toHaveTextContent('26/11/2026');
    await waitFor(async () => {
      const stored = await scheduleRepository.get(industrial.id);
      expect(stored?.tasks.find((task) => task.id === 't-A')?.duration).toBe(3);
    });
    expect(await screen.findByText('Salvo')).toBeInTheDocument();
  });

  it('keeps the editor open with a specific message on invalid input', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.dblClick(cell('Levantamento técnico', 7));
    const input = screen.getByRole('textbox', { name: 'Progresso de 1.1 Levantamento técnico' });
    await user.clear(input);
    await user.type(input, '150{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('entre 0 e 100');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.keyboard('{Escape}');
    expect(cell('Levantamento técnico', 7)).toHaveTextContent('100%');
  });

  it('rejects a circular link typed in the predecessors cell', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.dblClick(cell('Levantamento técnico', 5));
    await user.type(screen.getByRole('textbox', { name: /Predecessoras/ }), '1.3{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('Vínculo circular');
    expect((await scheduleRepository.get(industrial.id))?.dependencies).toHaveLength(8);
  });

  it('collapses and expands a phase from the keyboard, remembering it', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const rowsBefore = screen.getAllByRole('row').length;

    await user.click(cell('Engenharia', 1));
    await user.keyboard('{ArrowLeft}');
    expect(row('Levantamento técnico')).toBeUndefined();
    expect(row('Engenharia')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('row')).toHaveLength(rowsBefore - 3);
    expect(useWorkspaceUiStore.getState().collapsedIds.has('t-eng')).toBe(true);

    await user.keyboard('{ArrowRight}');
    expect(row('Levantamento técnico')).toBeDefined();
  });

  it('creates the first task of an empty project, naming it right away', async () => {
    const user = userEvent.setup();
    await renderAt(projectHref(empty.id));

    await user.click(await screen.findByRole('button', { name: 'Criar primeira tarefa' }));
    const input = await screen.findByRole('textbox', { name: /Nome da tarefa de 1 / });
    await user.clear(input);
    await user.type(input, 'Levantamento{Enter}');

    expect(cell('Levantamento', 0)).toHaveTextContent('1');
    await waitFor(async () => {
      expect((await scheduleRepository.get(empty.id))?.tasks.map((task) => task.name)).toEqual([
        'Levantamento',
      ]);
    });
  });

  it('indents with Alt+Shift+→ and refuses to nest under a linked task', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.click(cell('Treinamento da equipe', 1));
    await user.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}');

    // "Comissionamento" has links, so it cannot become a summary task.
    expect(
      await screen.findByText(/tem vínculos e não pode receber subtarefas/),
    ).toBeInTheDocument();
    expect(cell('Treinamento da equipe', 0)).toHaveTextContent('3.4');
  });

  it('deletes a phase after confirming what goes away', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.click(cell('Suprimentos', 1));
    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('2 subtarefas e 3 vínculos');

    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(row('Suprimentos')).toBeUndefined();
    expect(cell('Implantação', 0)).toHaveTextContent('2');
    await waitFor(async () => {
      expect((await scheduleRepository.get(industrial.id))?.dependencies).toHaveLength(5);
    });
  });

  /** Opens the row menu of a task with Shift+F10 and picks an item. */
  async function chooseRowAction(
    user: ReturnType<typeof userEvent.setup>,
    task: string,
    item: string,
  ) {
    await user.click(cell(task, 1));
    await user.keyboard('{Shift>}{F10}{/Shift}');
    await user.click(await screen.findByRole('menuitem', { name: item }));
  }

  it('converts a task into a milestone from the row menu', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await chooseRowAction(user, 'Treinamento da equipe', 'Converter em marco');
    expect(cell('Treinamento da equipe', 2)).toHaveTextContent('0 dias');
  });

  it('duplicates a task below itself from the row menu', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await chooseRowAction(user, 'Treinamento da equipe', 'Duplicar (sem vínculos)');
    expect(cell('Treinamento da equipe (cópia)', 0)).toHaveTextContent('3.5');
  });

  it('switches a task to manual scheduling from the row menu', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await chooseRowAction(user, 'Treinamento da equipe', 'Agendar manualmente');
    expect(
      within(row('Treinamento da equipe') ?? document.body).getByText('Agendamento manual'),
    ).toBeInTheDocument();
  });

  it('adds a subtask from the row menu, turning the task into a summary', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await chooseRowAction(user, 'Treinamento da equipe', 'Nova subtarefa');
    const input = await screen.findByRole('textbox', { name: /Nome da tarefa de 3\.4\.1 / });
    await user.type(input, '{Escape}');
    expect(cell('Treinamento da equipe', 2)).toHaveAttribute('aria-readonly', 'true');
  });

  it('moves between editable cells with Tab while editing', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.dblClick(cell('Levantamento técnico', 1));
    await user.keyboard('{Tab}');
    expect(
      screen.getByRole('textbox', { name: 'Duração de 1.1 Levantamento técnico' }),
    ).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(
      screen.getByRole('textbox', { name: 'Nome da tarefa de 1.1 Levantamento técnico' }),
    ).toHaveFocus();
  });

  it('filters tasks keeping their phases as context', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await user.type(screen.getByRole('searchbox', { name: 'Filtrar tarefas' }), 'aquisicao');
    expect(row('Aquisição')).toBeDefined();
    expect(row('Suprimentos')).toBeDefined();
    expect(row('Engenharia')).toBeUndefined();

    await user.clear(screen.getByRole('searchbox', { name: 'Filtrar tarefas' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filtrar tarefas' }), 'xyz');
    expect(screen.getByRole('heading', { name: 'Nenhuma tarefa encontrada' })).toBeInTheDocument();
  });

  it('shows a failed save and retries it', async () => {
    const user = userEvent.setup();
    const save = scheduleRepository.save.bind(scheduleRepository);
    const spy = vi.spyOn(scheduleRepository, 'save').mockRejectedValueOnce(new Error('offline'));
    await openWorkspace();

    await user.dblClick(cell('Levantamento técnico', 1));
    await user.keyboard('{Control>}a{/Control}Levantamento{Enter}');
    expect(await screen.findByText('Erro ao salvar')).toBeInTheDocument();

    spy.mockImplementation(save);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Salvo')).toBeInTheDocument();
    expect(
      (await scheduleRepository.get(industrial.id))?.tasks.find((task) => task.id === 't-A')?.name,
    ).toBe('Levantamento');
  });

  it('reports a project that does not exist', async () => {
    await renderAt(projectHref('missing'));
    expect(
      await screen.findByRole('heading', { name: 'Projeto não encontrado' }),
    ).toBeInTheDocument();
  });

  it('switches projects without showing the previous tasks', async () => {
    await openWorkspace();
    act(() => {
      window.location.hash = projectHref(empty.id);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(
      await screen.findByRole('heading', { name: 'Nenhuma tarefa ainda' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Levantamento técnico')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    await openWorkspace();
    await expectNoAxeViolations();
  });
});

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { dayToIsoDate, getTodayIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import type { Project } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const today = getTodayIsoDate();
const inDays = (days: number) => dayToIsoDate(isoDateToDay(today) + days);

const project = makeProject({
  id: '00000000-0000-4000-8000-0000000000c1',
  title: 'Reforma da oficina',
  status: 'in_progress',
  startDate: inDays(-20),
  endDate: inDays(40),
  progress: 35,
  lifecycle: {
    startedAt: inDays(-20),
    completedAt: null,
    closedAt: null,
    closeReason: null,
    postponement: null,
    history: [
      {
        from: null,
        to: 'in_progress',
        at: '2026-01-01T00:00:00.000Z',
        effectiveDate: inDays(-20),
        reason: null,
      },
    ],
  },
});

async function renderAppWith(projects: Project[]) {
  await projectRepository.replaceAll(projects);
  useProjectsStore.setState({ projects: [], status: 'idle', error: null });
  const result = render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
  act(() => {
    useDrawerStore.getState().openProject(project.id);
  });
  return result;
}

function statusSection() {
  return within(screen.getByRole('region', { name: 'Status do projeto' }));
}

async function chooseAction(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(statusSection().getByRole('button', { name: 'Alterar status' }));
  await user.click(await screen.findByRole('menuitem', { name: label }));
  return within(await screen.findByRole('dialog', { name: new RegExp(label, 'i') }));
}

async function storedProject() {
  const stored = await projectRepository.get(project.id);
  if (!stored) throw new Error('project not stored');
  return stored;
}

describe('project lifecycle flows', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await scheduleRepository.replaceAll([]);
    useDrawerStore.getState().close();
  });

  it('offers only the starting statuses when creating a project', async () => {
    const user = userEvent.setup();
    await renderAppWith([]);
    act(() => {
      useDrawerStore.getState().openCreate();
    });
    // Opened from the keyboard: jsdom has no pointer capture for the pointer path, and no
    // layout for the scroll to the selected option.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined,
    });
    screen.getByRole('combobox', { name: 'Status' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Planejado',
      'Em andamento',
    ]);
  });

  it('edits an existing project without a free status field', async () => {
    await renderAppWith([project]);
    expect(statusSection().getByText('Em andamento')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('postpones with a reason and a forecast, persists it, then resumes keeping the history', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderAppWith([project]);

    let dialog = await chooseAction(user, 'Adiar');
    await user.click(dialog.getByRole('button', { name: 'Adiar' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Informe o motivo do adiamento.');

    await user.type(dialog.getByLabelText('Motivo'), 'Aguardando peças');
    await user.click(dialog.getByRole('button', { name: 'Adiar' }));
    expect(dialog.getByRole('alert')).toHaveTextContent(
      'Informe a previsão de retomada ou o novo término previsto.',
    );
    expect(dialog.getByLabelText('Previsão de retomada')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(dialog.getByLabelText('Previsão de retomada'), {
      target: { value: inDays(14) },
    });
    await user.click(dialog.getByRole('button', { name: 'Adiar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Adiar projeto/ })).not.toBeInTheDocument();
    });
    expect(statusSection().getByText('Adiado')).toBeInTheDocument();
    expect(statusSection().getByText('Aguardando peças')).toBeInTheDocument();

    // Persisted: a fresh app reads it back with the plan and progress untouched.
    await waitFor(async () => {
      expect((await storedProject()).status).toBe('paused');
    });
    const stored = await storedProject();
    expect(stored.lifecycle.postponement).toEqual({
      reason: 'Aguardando peças',
      expectedResumeAt: inDays(14),
      revisedFinish: null,
    });
    expect(stored).toMatchObject({ endDate: project.endDate, progress: 35 });
    unmount();

    await renderAppWith([stored]);
    expect(statusSection().getByText('Adiado')).toBeInTheDocument();

    dialog = await chooseAction(user, 'Retomar');
    await user.click(dialog.getByRole('button', { name: 'Retomar' }));
    await waitFor(async () => {
      expect((await storedProject()).status).toBe('in_progress');
    });
    const resumed = await storedProject();
    expect(resumed.lifecycle.postponement).toBeNull();
    expect(resumed.lifecycle.history.map((change) => change.to)).toEqual([
      'in_progress',
      'paused',
      'in_progress',
    ]);
    await user.click(statusSection().getByText('Histórico de status (3)'));
    expect(statusSection().getByText(/Adiado → Em andamento/)).toBeInTheDocument();
  });

  it('asks for a justification to complete a project with pending tasks', async () => {
    const user = userEvent.setup();
    await scheduleRepository.replaceAll([
      createIndustrialSchedule({
        projectId: project.id,
        start: inDays(-20),
        generateId: (key) => `l-${key}`,
      }),
    ]);
    await renderAppWith([project]);

    const dialog = await chooseAction(user, 'Concluir');
    expect(
      await dialog.findByText(/tarefas do cronograma ainda não concluídas/),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Concluir' }));
    expect(dialog.getByRole('alert')).toHaveTextContent(/justifique a conclusão/);

    await user.type(
      dialog.getByLabelText('Justificativa'),
      'Escopo restante cancelado pelo cliente',
    );
    await user.click(dialog.getByRole('button', { name: 'Concluir' }));

    await waitFor(async () => {
      expect((await storedProject()).status).toBe('completed');
    });
    const stored = await storedProject();
    expect(stored.lifecycle.completedAt).toBe(today);
    expect(stored.lifecycle.history.at(-1)?.reason).toBe('Escopo restante cancelado pelo cliente');
    expect(statusSection().getByText('Concluído')).toBeInTheDocument();
  });

  it('closes without completing and reopens without losing the history', async () => {
    const user = userEvent.setup();
    await renderAppWith([project]);

    let dialog = await chooseAction(user, 'Encerrar sem concluir');
    await user.type(dialog.getByLabelText('Motivo'), 'Orçamento cortado');
    await user.click(dialog.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => {
      expect(statusSection().getByText('Não concluído')).toBeInTheDocument();
    });
    expect(statusSection().getByText('Orçamento cortado')).toBeInTheDocument();

    dialog = await chooseAction(user, 'Reabrir');
    await user.click(dialog.getByRole('button', { name: 'Reabrir' }));
    await waitFor(async () => {
      expect((await storedProject()).status).toBe('in_progress');
    });
    const stored = await storedProject();
    expect(stored.lifecycle).toMatchObject({ closedAt: null, closeReason: null });
    expect(stored.lifecycle.history.map((change) => change.to)).toEqual([
      'in_progress',
      'cancelled',
      'in_progress',
    ]);
    expect(stored.progress).toBe(35);
  });

  it('shows a late badge when the planned finish has passed, without changing the status', async () => {
    await renderAppWith([{ ...project, startDate: inDays(-60), endDate: inDays(-1) }]);
    expect(statusSection().getByText('Atrasado')).toBeInTheDocument();
    expect(statusSection().getByText('Em andamento')).toBeInTheDocument();
  });
});

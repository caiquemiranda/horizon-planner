import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { PORTFOLIO_HREF } from '@/lib/router';
import { projectRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';
import { makeProject } from '@/test/factories';
import type { ISODate, Project } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const today = getTodayIsoDate();
const AT = '2026-05-01T10:00:00.000Z';
const lifecycle = (dates: { started?: ISODate; completed?: ISODate }) => ({
  startedAt: dates.started ?? null,
  completedAt: dates.completed ?? null,
  closedAt: null,
  closeReason: null,
  postponement: null,
  history: [],
});

const running = makeProject({
  id: '00000000-0000-4000-8000-0000000000d7',
  title: 'Em curso',
  status: 'in_progress',
  progress: 40,
  lifecycle: lifecycle({ started: today }),
});
const hiddenDone = makeProject({
  title: 'Concluído e oculto',
  status: 'completed',
  hiddenAt: AT,
  lifecycle: lifecycle({ started: '2025-01-02' as ISODate, completed: today }),
});
const trashedDone = makeProject({
  id: '00000000-0000-4000-8000-0000000000d8',
  title: 'Na lixeira',
  status: 'completed',
  deletedAt: AT,
  lifecycle: lifecycle({ completed: today }),
});

async function renderApp(projects: Project[]) {
  window.location.hash = PORTFOLIO_HREF;
  await projectRepository.replaceAll(projects);
  useProjectsStore.setState({ projects: [], status: 'idle', error: null });
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
}

function card(group: string, label: string) {
  const section = within(screen.getByRole('region', { name: new RegExp(group) }));
  const term = section.getByText(label, { selector: 'dt' });
  return term.parentElement?.querySelector('dd')?.textContent;
}

describe('Meu painel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is reached from the sidebar and counts hidden projects but not the trash', async () => {
    const user = userEvent.setup();
    await renderApp([running, hiddenDone, trashedDone]);
    const nav = within(screen.getByRole('navigation', { name: 'Seções' }));
    await user.click(nav.getByRole('link', { name: 'Meu painel' }));
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Meu painel' })).toBeInTheDocument();
    const current = within(screen.getByRole('navigation', { name: 'Seções' }));
    expect(current.getByRole('link', { name: 'Meu painel' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(card('No período', 'Projetos concluídos')).toBe('1');
    expect(card('No período', 'Projetos iniciados')).toBe('2');
    expect(card('No período', 'Taxa de conclusão')).toBe('100%');
    expect(card('Agora', 'Em andamento')).toBe('1');
    expect(card('Agora', 'Progresso médio')).toBe('40%');
    expect(screen.getByText(/os 1 da lixeira ficam de fora/)).toBeInTheDocument();

    // Restoring brings it back into the indicators.
    await act(async () => {
      await useProjectsStore.getState().restore(trashedDone.id);
    });
    expect(card('No período', 'Projetos concluídos')).toBe('2');
  });

  it('applies the period to dated indicators only', async () => {
    const user = userEvent.setup();
    await renderApp([running, hiddenDone]);
    window.location.hash = '#/painel';
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await screen.findByRole('heading', { name: 'Meu painel' });

    await user.click(screen.getByRole('button', { name: 'Últimos 30 dias' }));
    expect(screen.getByRole('button', { name: 'Últimos 30 dias' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The hidden project started in 2025: out of the period; still completed today.
    expect(card('No período', 'Projetos iniciados')).toBe('1');
    expect(card('No período', 'Projetos concluídos')).toBe('1');
    expect(card('Agora', 'Em andamento')).toBe('1');
  });

  it('follows a status change at once', async () => {
    await renderApp([running]);
    window.location.hash = '#/painel';
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await screen.findByRole('heading', { name: 'Meu painel' });
    expect(card('No período', 'Projetos concluídos')).toBe('0');

    await act(async () => {
      await useProjectsStore
        .getState()
        .transition(running.id, { action: 'complete', date: today, reason: null });
    });
    expect(card('No período', 'Projetos concluídos')).toBe('1');
    expect(card('Agora', 'Em andamento')).toBe('0');
  });

  it('has no axe violations', async () => {
    await renderApp([running, hiddenDone]);
    window.location.hash = '#/painel';
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await screen.findByRole('heading', { name: 'Meu painel' });
    await expectNoAxeViolations(document.body);
  });
});

import { act, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { EXAMPLE_IDS } from '@/features/examples/lib/catalog';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { DASHBOARD_HREF, EXAMPLES_HREF, PORTFOLIO_HREF, projectHref } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';
import { makeProject } from '@/test/factories';
import { timelineBarTitles } from '@/test/timeline';

import { App } from '../App';
import { Providers } from '../providers';

const own = makeProject({ title: 'Piano', status: 'in_progress', progress: 40 });

async function renderAt(hash: string) {
  window.location.hash = hash;
  await projectRepository.replaceAll([own]);
  await scheduleRepository.replaceAll([]);
  useProjectsStore.setState({ projects: [], status: 'idle', error: null });
  useDrawerStore.setState({ view: { mode: 'closed' }, expandedProjectId: null });
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
}

function navigateTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function nav() {
  return within(screen.getByRole('navigation', { name: 'Seções' }));
}

async function install(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Explorar exemplos' }));
  return within(await screen.findByRole('list', { name: 'Projetos de exemplo' }));
}

describe('sample projects', () => {
  beforeEach(() => {
    configure({ asyncUtilTimeout: 5000 });
  });

  it('installs the samples on request, apart from the user’s projects and indicators', async () => {
    const user = userEvent.setup();
    await renderAt(EXAMPLES_HREF);

    const list = await install(user);
    expect(list.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Exemplos instalados: 3 projetos com dados fictícios.')).toBeVisible();
    expect(nav().getByRole('link', { name: 'Exemplos, 3 projetos' })).toBeInTheDocument();
    expect(nav().getByRole('link', { name: 'Todos os projetos, 1 projeto' })).toBeInTheDocument();
    expect(nav().getByRole('link', { name: 'Ativos, 1 projeto' })).toBeInTheDocument();

    // Not on the timeline, and not in "Meu painel".
    navigateTo(PORTFOLIO_HREF);
    expect(timelineBarTitles()).toEqual(['Piano']);
    navigateTo(DASHBOARD_HREF);
    expect(await screen.findByText(/Total considerado: 1\./)).toBeInTheDocument();

    // Installing again resets them: never a second copy.
    navigateTo(EXAMPLES_HREF);
    await user.click(await screen.findByRole('button', { name: 'Reiniciar exemplos' }));
    await screen.findByText('Exemplos reiniciados. Seus projetos não foram alterados.');
    expect(await projectRepository.list()).toHaveLength(4);
    expect(await scheduleRepository.listAll()).toHaveLength(3);
  });

  it('opens a sample read-only', async () => {
    const user = userEvent.setup();
    await renderAt(EXAMPLES_HREF);
    await install(user);

    navigateTo(projectHref(EXAMPLE_IDS.industrial));
    expect(await screen.findByText(/Projeto de exemplo, com dados fictícios/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova tarefa/ })).toBeDisabled();
  });

  it('creates a real project from a sample, then removes only the samples', async () => {
    const user = userEvent.setup();
    await renderAt(EXAMPLES_HREF);
    await install(user);

    await user.click(
      screen.getByRole('button', {
        name: 'Criar projeto a partir de “Implantação de SDAI na planta fabril”',
      }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    const title = dialog.getByLabelText('Título do novo projeto');
    await user.clear(title);
    await user.type(title, 'SDAI planta 2');
    await user.click(dialog.getByRole('button', { name: 'Criar projeto' }));

    await waitFor(() => {
      expect(window.location.hash).not.toBe(EXAMPLES_HREF);
    });
    const created = (await projectRepository.list()).find(
      (project) => project.title === 'SDAI planta 2',
    );
    expect(created).toMatchObject({ demo: false, status: 'planned', progress: 0 });
    expect(window.location.hash).toBe(projectHref(created?.id ?? ''));
    const schedule = await scheduleRepository.get(created?.id ?? '');
    expect(schedule?.tasks.length).toBeGreaterThan(25);
    expect(schedule?.tasks.every((task) => task.progress === 0)).toBe(true);
    expect(schedule?.checkIns).toEqual([]);

    navigateTo(EXAMPLES_HREF);
    await user.click(await screen.findByRole('button', { name: 'Remover exemplos' }));
    await screen.findByRole('button', { name: 'Explorar exemplos' });
    expect((await projectRepository.list()).map((project) => project.title).sort()).toEqual([
      'Piano',
      'SDAI planta 2',
    ]);
    expect((await scheduleRepository.listAll()).map((saved) => saved.projectId)).toEqual([
      created?.id,
    ]);
  });

  it('has no axe violations with the samples installed', async () => {
    const user = userEvent.setup();
    await renderAt(EXAMPLES_HREF);
    await install(user);
    await expectNoAxeViolations(document.body);
  });
});

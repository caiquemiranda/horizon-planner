import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { projectRepository } from '@/services/persistence';
import { makeDraft } from '@/services/persistence/__tests__/helpers';
import type { ISODate } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

async function renderApp() {
  const result = render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
  return result;
}

function getDrawer() {
  return screen.getByRole('dialog');
}

describe('project flows', () => {
  beforeEach(async () => {
    await projectRepository.replaceAll([]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.getState().close();
    useViewportStore.getState().setViewport({
      startDay: 20_500,
      pxPerDay: 6.5,
      widthPx: 1000,
    });
  });

  it('creates a project from the empty state', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Criar projeto' }));
    expect(within(getDrawer()).getByRole('heading', { name: 'Novo projeto' })).toBeInTheDocument();

    await user.type(within(getDrawer()).getByLabelText('Título'), 'Maratona');
    await user.click(within(getDrawer()).getByRole('button', { name: 'Criar projeto' }));

    // The drawer switches to editing the new project, which is listed and persisted.
    await waitFor(() => {
      expect(within(getDrawer()).getByRole('heading', { name: 'Maratona' })).toBeInTheDocument();
    });
    expect(
      within(screen.getByRole('region', { name: 'Linha do tempo' })).getByRole('list', {
        name: 'Projetos',
      }),
    ).toHaveTextContent('Maratona');
    expect((await projectRepository.list()).map((project) => project.title)).toEqual(['Maratona']);
  });

  it('opens the form with N and validates before creating', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.keyboard('n');
    const drawer = getDrawer();
    expect(within(drawer).getByLabelText('Título')).toHaveFocus();

    await user.click(within(drawer).getByRole('button', { name: 'Criar projeto' }));

    expect(within(drawer).getByText('O título é obrigatório.')).toBeInTheDocument();
    expect(await projectRepository.list()).toEqual([]);
  });

  it('suggests the horizon from the dates until the user picks one', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.keyboard('n');
    const drawer = getDrawer();
    const end = within(drawer).getByLabelText('Término');
    await user.clear(end);
    await user.type(end, '2030-01-01');

    expect(within(drawer).getByRole('combobox', { name: 'Horizonte' })).toHaveTextContent(
      'Longo prazo',
    );
  });

  it('syncs edits to the timeline while typing', async () => {
    const user = userEvent.setup();
    await projectRepository.create(makeDraft({ title: 'Piano', horizon: 'medium' }));
    await renderApp();

    await user.click(
      within(screen.getByRole('region', { name: 'Linha do tempo' })).getByRole('button', {
        name: 'Piano',
      }),
    );
    const title = within(getDrawer()).getByLabelText('Título');
    await user.type(title, ' clássico');

    // The sidebar (and the bar) update before anything is "saved".
    expect(
      within(screen.getByRole('region', { name: 'Linha do tempo' })).getByRole('list', {
        name: 'Projetos',
      }),
    ).toHaveTextContent('Piano clássico');
    await waitFor(async () => {
      expect((await projectRepository.list())[0]?.title).toBe('Piano clássico');
    });
  });

  it('keeps invalid edits local and explains why', async () => {
    const user = userEvent.setup();
    await projectRepository.create(
      makeDraft({
        title: 'Piano',
        startDate: '2026-01-10' as ISODate,
        endDate: '2026-09-30' as ISODate,
      }),
    );
    await renderApp();

    await user.click(
      within(screen.getByRole('region', { name: 'Linha do tempo' })).getByRole('button', {
        name: 'Piano',
      }),
    );
    const drawer = getDrawer();
    const end = within(drawer).getByLabelText('Término');
    await user.clear(end);
    await user.type(end, '2025-01-01');

    expect(within(drawer).getByText(/posterior à data de início/)).toBeInTheDocument();
    expect(within(drawer).getByRole('status')).toHaveTextContent(/Corrija os campos/);
    expect((await projectRepository.list())[0]?.endDate).toBe('2026-09-30');
  });

  it('closes the drawer with Escape', async () => {
    const user = userEvent.setup();
    await projectRepository.create(makeDraft({ title: 'Piano' }));
    await renderApp();

    await user.click(
      within(screen.getByRole('region', { name: 'Linha do tempo' })).getByRole('button', {
        name: 'Piano',
      }),
    );
    expect(getDrawer()).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows store errors and lets the user dismiss them', async () => {
    const user = userEvent.setup();
    await renderApp();

    act(() => {
      useProjectsStore.setState({ error: 'Não foi possível salvar as alterações.' });
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível salvar');

    await user.click(within(alert).getByRole('button', { name: 'Dispensar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

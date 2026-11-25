import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { projectRepository } from '@/services/persistence';
import { makeDraft } from '@/services/persistence/__tests__/helpers';

import { App } from '../App';
import { Providers } from '../providers';

async function renderApp() {
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
}

/** Titles listed in the sidebar, lane by lane. */
function sidebarTitles() {
  return screen
    .getAllByRole('listitem')
    .filter((item) => item.closest('[aria-label="Linha do tempo"]'))
    .map((item) => item.querySelector('[data-project-id]')?.getAttribute('aria-label') ?? '');
}

async function toggleOption(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name: /^Filtros/ }));
  await user.click(await screen.findByRole('menuitemcheckbox', { name }));
  await user.keyboard('{Escape}');
}

describe('filter flows', () => {
  beforeEach(async () => {
    await projectRepository.replaceAll([]);
    await projectRepository.create(
      makeDraft({ title: 'Piano', horizon: 'medium', status: 'in_progress', category: 'Música' }),
    );
    await projectRepository.create(
      makeDraft({ title: 'Corrida', horizon: 'short', status: 'planned', category: 'Saúde' }),
    );
    await projectRepository.create(
      makeDraft({ title: 'Casa', horizon: 'long', status: 'planned', category: null }),
    );
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.getState().close();
    useFiltersStore.getState().clearAll();
    useViewportStore.getState().setViewport({ startDay: 20_500, pxPerDay: 6.5, widthPx: 1000 });
  });

  it('filters by status and shows the active filters', async () => {
    const user = userEvent.setup();
    await renderApp();

    await toggleOption(user, /^Planejado/);

    expect(sidebarTitles()).toEqual(['Corrida', 'Casa']);
    const bar = screen.getByRole('region', { name: 'Filtros ativos' });
    expect(bar).toHaveTextContent('Status:Planejado');
    expect(within(bar).getByRole('status')).toHaveTextContent('2 de 3 projetos');
    expect(screen.getByRole('button', { name: 'Filtros (1 ativos)' })).toBeInTheDocument();
  });

  it('hides the lanes of unselected horizons', async () => {
    const user = userEvent.setup();
    await renderApp();

    await toggleOption(user, /^Longo prazo/);

    expect(screen.queryByRole('list', { name: 'Projetos de curto prazo' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Projetos de longo prazo' })).toHaveTextContent('Casa');
  });

  it('filters projects without a category', async () => {
    const user = userEvent.setup();
    await renderApp();

    await toggleOption(user, /^Sem categoria/);

    expect(sidebarTitles()).toEqual(['Casa']);
  });

  it('shows faceted counts in the menu', async () => {
    const user = userEvent.setup();
    await renderApp();
    await toggleOption(user, /^Curto prazo/);

    await user.click(screen.getByRole('button', { name: /^Filtros/ }));

    // With the short-term filter, only "Corrida" counts for status and category.
    expect(screen.getByRole('menuitemcheckbox', { name: /^Planejado/ })).toHaveTextContent('1');
    expect(screen.getByRole('menuitemcheckbox', { name: /^Em andamento/ })).toHaveTextContent('0');
    expect(screen.getByRole('menuitemcheckbox', { name: /^Curto prazo/ })).toBeChecked();
  });

  it('removes one dimension from the bar and clears everything from the empty state', async () => {
    const user = userEvent.setup();
    await renderApp();
    await toggleOption(user, /^Saúde/);
    await toggleOption(user, /^Adiado/);

    expect(
      screen.getByRole('heading', { name: 'Nenhum projeto com esses filtros' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover filtro de status' }));
    expect(sidebarTitles()).toEqual(['Corrida']);

    await toggleOption(user, /^Adiado/);
    const bar = screen.getByRole('region', { name: 'Filtros ativos' });
    await user.click(within(bar).getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.queryByRole('region', { name: 'Filtros ativos' })).not.toBeInTheDocument();
    expect(sidebarTitles()).toHaveLength(3);
  });

  it('keeps the project being edited visible after it stops matching', async () => {
    const user = userEvent.setup();
    await renderApp();
    await toggleOption(user, /^Música/);

    await user.click(
      within(screen.getByRole('region', { name: 'Linha do tempo' })).getByRole('button', {
        name: 'Piano',
      }),
    );
    const category = within(screen.getByRole('dialog')).getByLabelText('Categoria');
    await user.clear(category);
    await user.type(category, 'Arte');

    expect(sidebarTitles()).toEqual(['Piano']);
    const bar = screen.getByRole('region', { name: 'Filtros ativos' });
    expect(within(bar).getByRole('status')).toHaveTextContent('0 de 3 projetos');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(sidebarTitles()).toEqual([]);
  });
});

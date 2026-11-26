import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { useSidebarStore } from '@/features/projects/store/sidebarStore';
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

/** The filter panel in the sidebar. */
function panel() {
  return within(screen.getByRole('region', { name: 'Filtros' }));
}

/** Unfolds the panel when needed and toggles one option. */
async function toggleOption(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const toggle = panel().getByRole('button', { name: /^Filtros/ });
  if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle);
  await user.click(panel().getByRole('checkbox', { name }));
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
    useSidebarStore.setState({ collapsed: false, filtersOpen: false });
    useViewportStore.getState().setViewport({ startDay: 20_500, pxPerDay: 6.5, widthPx: 1000 });
  });

  it('filters by status and shows the active filters', async () => {
    const user = userEvent.setup();
    await renderApp();

    await toggleOption(user, /^Planejado/);

    expect(sidebarTitles()).toEqual(['Corrida', 'Casa']);
    expect(panel().getByRole('checkbox', { name: /^Planejado/ })).toBeChecked();
    expect(panel().getByRole('status')).toHaveTextContent('2 de 3 projetos');
    expect(panel().getByRole('button', { name: 'Filtros (1 ativos)' })).toBeInTheDocument();
    // Filtering lives in the sidebar only: nothing is added to the header or the timeline.
    expect(screen.queryByRole('region', { name: 'Filtros ativos' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).queryByRole('button', { name: /^Filtros/ }),
    ).toBeNull();
  });

  it('hides the projects of unselected horizons', async () => {
    const user = userEvent.setup();
    await renderApp();

    await toggleOption(user, /^Longo prazo/);

    const timeline = within(screen.getByRole('region', { name: 'Linha do tempo' }));
    expect(timeline.getByRole('list', { name: 'Projetos' })).toHaveTextContent('Casa');
    expect(timeline.queryByText('Corrida')).not.toBeInTheDocument();
  });

  it('filters projects without a category', async () => {
    const user = userEvent.setup();
    await renderApp();

    await toggleOption(user, /^Sem categoria/);

    expect(sidebarTitles()).toEqual(['Casa']);
  });

  it('shows faceted counts in the panel', async () => {
    const user = userEvent.setup();
    await renderApp();
    await toggleOption(user, /^Curto prazo/);

    // With the short-term filter, only "Corrida" counts for status and category.
    expect(panel().getByRole('checkbox', { name: 'Planejado, 1 projeto' })).toBeInTheDocument();
    expect(panel().getByRole('checkbox', { name: 'Em andamento, 0 projetos' })).toBeInTheDocument();
    expect(panel().getByRole('checkbox', { name: /^Curto prazo/ })).toBeChecked();
  });

  it('folds the panel and reopens it from the collapsed rail', async () => {
    const user = userEvent.setup();
    await renderApp();
    await toggleOption(user, /^Planejado/);

    const toggle = panel().getByRole('button', { name: 'Filtros (1 ativos)' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel().queryByRole('checkbox')).not.toBeInTheDocument();
    // Folded, the panel still says how many projects match.
    expect(panel().getByRole('status')).toHaveTextContent('2 de 3 projetos');

    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(screen.queryByRole('region', { name: 'Filtros' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filtros (1 ativos)' }));
    expect(panel().getByRole('checkbox', { name: /^Planejado/ })).toBeChecked();
  });

  it('removes one dimension from the bar and clears everything from the empty state', async () => {
    const user = userEvent.setup();
    await renderApp();
    await toggleOption(user, /^Saúde/);
    await toggleOption(user, /^Adiado/);

    expect(
      screen.getByRole('heading', { name: 'Nenhum projeto com esses filtros' }),
    ).toBeInTheDocument();

    await toggleOption(user, /^Adiado/);
    expect(sidebarTitles()).toEqual(['Corrida']);

    await toggleOption(user, /^Adiado/);
    await user.click(panel().getByRole('button', { name: 'Limpar filtros' }));
    expect(panel().queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
    expect(panel().getByRole('checkbox', { name: /^Saúde/ })).not.toBeChecked();
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
    expect(panel().getByRole('status')).toHaveTextContent('0 de 3 projetos');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(sidebarTitles()).toEqual([]);
  });
});

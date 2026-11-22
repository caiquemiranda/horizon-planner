import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { createSampleProjects } from '@/features/data-io/lib/sampleData';
import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { projectRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';

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

describe('accessibility', () => {
  beforeEach(async () => {
    await projectRepository.replaceAll([]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.getState().close();
    useFiltersStore.getState().clearAll();
    useViewportStore.getState().setViewport({
      startDay: 20_400,
      pxPerDay: 2,
      widthPx: 1200,
    });
  });

  it('offers a skip link to the timeline as the first tab stop', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.tab();
    const link = screen.getByRole('link', { name: 'Pular para a linha do tempo' });
    expect(link).toHaveFocus();

    await user.click(link);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('has no violations on the empty timeline', async () => {
    await renderApp();

    await expectNoAxeViolations();
  });

  it('has no violations on a full timeline with active filters', async () => {
    await projectRepository.replaceAll(createSampleProjects(getTodayIsoDate()));
    await renderApp();
    useFiltersStore.getState().toggleStatus('in_progress');

    await screen.findByRole('region', { name: 'Filtros ativos' });
    await expectNoAxeViolations();
  });

  it('has no violations with the drawer open', async () => {
    const user = userEvent.setup();
    await projectRepository.replaceAll(createSampleProjects(getTodayIsoDate()));
    await renderApp();

    await user.click(screen.getByText('Mestrado', { selector: 'li button span' }));
    await within(screen.getByRole('dialog')).findByLabelText('Título');

    await expectNoAxeViolations();
  });

  it('has no violations in the create form after a failed submit', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.keyboard('n');
    const drawer = screen.getByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Criar projeto' }));
    await within(drawer).findByText('O título é obrigatório.');

    await expectNoAxeViolations();
  });

  it('has no violations in the open menus', async () => {
    const user = userEvent.setup();
    await projectRepository.replaceAll(createSampleProjects(getTodayIsoDate()));
    await renderApp();

    await user.click(screen.getByRole('button', { name: /^Filtros/ }));
    await screen.findByRole('menu');
    await expectNoAxeViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Dados' }));
    await screen.findByRole('menu');
    await expectNoAxeViolations();
  });
});

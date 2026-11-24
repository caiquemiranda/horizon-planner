import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { SIDEBAR_STORAGE_KEY, useSidebarStore } from '@/features/projects/store/sidebarStore';
import { PORTFOLIO_HREF, projectHref, SECTION_HREFS } from '@/lib/router';
import { projectRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import type { Project } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const AT = '2026-05-01T10:00:00.000Z';
const planned = makeProject({ title: 'Planejado A', status: 'planned' });
const inProgress = makeProject({ title: 'Andamento B', status: 'in_progress' });
const projects: Project[] = [
  planned,
  inProgress,
  makeProject({ title: 'Adiado C', status: 'paused' }),
  makeProject({ title: 'Encerrado D', status: 'cancelled' }),
  makeProject({ title: 'Feito E', status: 'completed' }),
  makeProject({ title: 'Feito oculto F', status: 'completed', hiddenAt: AT }),
  makeProject({ title: 'Lixo G', status: 'in_progress', deletedAt: AT }),
];

async function renderAt(hash: string) {
  window.location.hash = hash;
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
  return result;
}

function navigateTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function timelineTitles() {
  return screen
    .queryAllByRole('listitem')
    .filter((item) => item.closest('section[aria-label="Horizontes"]'))
    .map((item) => item.textContent.replace(/\d+%$/, ''))
    .sort();
}

function nav() {
  return within(screen.getByRole('navigation', { name: 'Seções' }));
}

describe('navigation sidebar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSidebarStore.setState({ collapsed: false, mobileOpen: false });
    useDrawerStore.getState().close();
  });

  it('shows each section with counts that match its list', async () => {
    await renderAt(PORTFOLIO_HREF);
    const expected: [RegExp, string, string[]][] = [
      [
        /^Todos os projetos/,
        '5',
        ['Adiado C', 'Andamento B', 'Encerrado D', 'Feito E', 'Planejado A'],
      ],
      [/^Ativos/, '2', ['Andamento B', 'Planejado A']],
      [/^Adiados/, '1', ['Adiado C']],
      [/^Não concluídos/, '1', ['Encerrado D']],
      [/^Concluídos/, '1', ['Feito E']],
    ];
    for (const [name, count, titles] of expected) {
      const link = nav().getByRole('link', { name });
      expect(link).toHaveTextContent(count);
      navigateTo(link.getAttribute('href') ?? '');
      expect(nav().getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
      expect(timelineTitles()).toEqual(titles);
    }
    expect(nav().getByRole('link', { name: /^Ocultos/ })).toHaveTextContent('1');
    expect(nav().getByRole('link', { name: /^Lixeira/ })).toHaveTextContent('1');
  });

  it('keeps a hidden completed project out of "Concluídos" and lists it in "Ocultos"', async () => {
    await renderAt(SECTION_HREFS.hidden);
    expect(
      within(screen.getByRole('list', { name: 'Projetos ocultos' })).getByText('Feito oculto F'),
    ).toBeInTheDocument();
    navigateTo(SECTION_HREFS.completed);
    expect(timelineTitles()).toEqual(['Feito E']);
  });

  it('explains an empty section and links back to every project', async () => {
    window.location.hash = SECTION_HREFS.postponed;
    await projectRepository.replaceAll([planned]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    render(
      <Providers>
        <App />
      </Providers>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Nenhum projeto em “Adiados”' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todos os projetos' })).toHaveAttribute(
      'href',
      PORTFOLIO_HREF,
    );
  });

  it('collapses to icons, keeps every section reachable and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderAt(PORTFOLIO_HREF);

    const toggle = screen.getByRole('button', { name: 'Recolher menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);

    const expand = screen.getByRole('button', { name: 'Expandir menu' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    // Names stay available to assistive technology, with the count spelled out.
    expect(nav().getByRole('link', { name: 'Ativos, 2 projetos' })).toBeInTheDocument();
    expect(nav().getAllByRole('link')).toHaveLength(8);
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('collapsed');

    await user.hover(nav().getByRole('link', { name: /^Lixeira/ }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Lixeira · 1');

    unmount();
    useSidebarStore.setState({
      collapsed: window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed',
    });
    await renderAt(PORTFOLIO_HREF);
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toBeInTheDocument();
  });

  it('opens the sections in a drawer on phones and closes it after choosing', async () => {
    const user = userEvent.setup();
    await renderAt(PORTFOLIO_HREF);

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    const drawer = within(await screen.findByRole('dialog', { name: 'Seções' }));
    await user.click(drawer.getByRole('link', { name: /^Concluídos/ }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Seções' })).not.toBeInTheDocument();
    });
  });

  it('keeps the project being edited on screen when its status leaves the section', async () => {
    await renderAt(SECTION_HREFS.active);
    const project = inProgress;
    act(() => {
      useDrawerStore.getState().openProject(project.id);
    });
    await act(async () => {
      await useProjectsStore.getState().transition(project.id, {
        action: 'close',
        date: '2026-01-02' as never,
        reason: 'Sem verba',
      });
    });
    expect(timelineTitles()).toEqual(['Andamento B', 'Planejado A']);

    act(() => {
      useDrawerStore.getState().close();
    });
    expect(timelineTitles()).toEqual(['Planejado A']);
  });

  it('lists the projects of a section, sorted, and opens one', async () => {
    const user = userEvent.setup();
    await renderAt(PORTFOLIO_HREF);
    await user.click(nav().getByRole('button', { name: 'Mostrar projetos de Ativos' }));
    const list = within(nav().getByRole('list', { name: 'Projetos de Ativos' }));
    expect(list.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Andamento B',
      'Planejado A',
    ]);
    expect(nav().getByRole('button', { name: 'Ocultar projetos de Ativos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(list.getByRole('link', { name: 'Andamento B' })).toHaveAttribute(
      'href',
      projectHref(inProgress.id),
    );
  });

  it('finds any project by title, hidden and trashed ones included', async () => {
    const user = userEvent.setup();
    await renderAt(PORTFOLIO_HREF);
    const search = nav().getByRole('searchbox', { name: 'Buscar projeto' });

    await user.type(search, 'feito');
    const results = within(nav().getByRole('list', { name: 'Resultados da busca' }));
    expect(results.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Feito EConcluídos',
      'Feito oculto FOcultos',
    ]);
    expect(nav().getByText('2 projetos encontrados')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'lixo');
    expect(
      within(nav().getByRole('list', { name: 'Resultados da busca' })).getByText('Lixeira'),
    ).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(nav().getByText('Nenhum projeto encontrado')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
  });

  it('opens the search from the collapsed rail', async () => {
    const user = userEvent.setup();
    await renderAt(PORTFOLIO_HREF);
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    await user.click(nav().getByRole('button', { name: 'Buscar projeto' }));
    expect(nav().getByRole('searchbox', { name: 'Buscar projeto' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toBeInTheDocument();
  });

  it('marks the open project in the workspace sidebar, expanded and collapsed', async () => {
    const user = userEvent.setup();
    await renderAt(projectHref(inProgress.id));
    await screen.findByRole('heading', { level: 1, name: inProgress.title });
    expect(nav().getByRole('link', { name: 'Andamento B' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(nav().getByRole('link', { name: 'Projeto atual: Andamento B' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

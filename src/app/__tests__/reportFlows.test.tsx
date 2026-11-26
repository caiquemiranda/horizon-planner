import { act, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { getTodayIsoDate } from '@/features/timeline/lib/time';
import { projectHref, reportHref } from '@/lib/router';
import { projectRepository, SCHEDULE_KEY_PREFIX, scheduleRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';
import { makeProject } from '@/test/factories';

import { App } from '../App';
import { Providers } from '../providers';

const project = makeProject({ title: 'Implantação SDAI', status: 'in_progress' });
const empty = makeProject({ title: 'Sem cronograma', status: 'planned', progress: 30 });

async function renderAt(hash: string) {
  window.location.hash = hash;
  await projectRepository.replaceAll([project, empty]);
  await scheduleRepository.replaceAll([
    createIndustrialSchedule({
      projectId: project.id,
      start: getTodayIsoDate(),
      generateId: (key) => `k-${key}`,
    }),
  ]);
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

describe('project report', () => {
  beforeEach(() => {
    configure({ asyncUtilTimeout: 5000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens from the project page with every section and the whole WBS', async () => {
    const user = userEvent.setup();
    await renderAt(projectHref(project.id));
    await user.click(await screen.findByRole('link', { name: 'Visualizar relatório' }));

    expect(window.location.hash).toBe(reportHref(project.id));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Implantação SDAI' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Relatório de andamento')).toBeInTheDocument();
    expect(screen.getByText(/Dados considerados até:/)).toBeInTheDocument();
    for (const name of [
      'Sumário executivo',
      'Indicadores',
      'Gráficos',
      'Pendências e próximos passos',
      'Estrutura analítica (EAP)',
      'Cronograma',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    // Same percentage as the plan, and every task in the table (no collapsed phase).
    const schedule = await scheduleRepository.get(project.id);
    if (!schedule) throw new Error('missing schedule');
    const progress = computeSchedule(schedule).progress;
    const indicators = within(screen.getByRole('region', { name: 'Indicadores' }));
    expect(indicators.getByText(`${String(progress)}%`)).toBeInTheDocument();
    const wbs = within(screen.getByRole('region', { name: 'Estrutura analítica (EAP)' }));
    expect(wbs.getAllByRole('row')).toHaveLength(schedule.tasks.length + 1);
    expect(screen.getByRole('link', { name: 'Voltar ao projeto' })).toHaveAttribute(
      'href',
      projectHref(project.id),
    );
  });

  it('follows changes saved in another tab without a reload', async () => {
    await renderAt(reportHref(project.id));
    const wbs = within(await screen.findByRole('region', { name: 'Estrutura analítica (EAP)' }));
    expect(wbs.getByText('Aquisição')).toBeInTheDocument();

    const schedule = await scheduleRepository.get(project.id);
    if (!schedule) throw new Error('missing schedule');
    // Another tab (or the workspace in another window) saves the plan.
    await scheduleRepository.save(
      {
        ...schedule,
        tasks: schedule.tasks.map((task) =>
          task.name === 'Aquisição' ? { ...task, name: 'Compra de materiais' } : task,
        ),
      },
      schedule.revision,
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SCHEDULE_KEY_PREFIX + project.id }));
    });
    expect(await wbs.findByText('Compra de materiais')).toBeInTheDocument();
  });

  it('reports a project without a schedule from its portfolio data', async () => {
    await renderAt(reportHref(empty.id));
    expect(await screen.findByText(/ainda não tem cronograma/)).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cronograma' })).not.toBeInTheDocument();
  });

  it('ends with "Imprimir / Salvar em PDF", which opens the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderAt(reportHref(project.id));
    const article = await screen.findByRole('article');
    const footer = within(article).getByRole('contentinfo');
    // The last thing on the page, after the notes.
    expect(article.lastElementChild).toBe(footer);
    expect(
      within(footer).getByText(/No diálogo de impressão, escolha “Salvar como PDF”/),
    ).toBeInTheDocument();
    expect(within(footer).getByText(/documento RA-.+ · gerado em/)).toBeInTheDocument();

    await user.click(within(footer).getByRole('button', { name: 'Imprimir / Salvar em PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Imprimir relatório' }));
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('prints the Gantt as pages, besides the whole chart on screen', async () => {
    await renderAt(reportHref(project.id));
    const gantt = within(await screen.findByRole('region', { name: 'Cronograma' }));
    expect(
      gantt.getByRole('img', { name: /^Gráfico de Gantt de Implantação SDAI/ }),
    ).toBeInTheDocument();
    expect(gantt.getByRole('img', { name: /^Parte do gráfico de Gantt/ })).toBeInTheDocument();
  });

  it('explains an unknown project', async () => {
    await renderAt(reportHref('nao-existe'));
    expect(await screen.findByText(/Projeto não encontrado/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    await renderAt(reportHref(project.id));
    await screen.findByRole('region', { name: 'Cronograma' });
    await expectNoAxeViolations(document.body);
  });
});

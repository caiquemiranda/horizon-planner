import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import { HIDDEN_HREF, PORTFOLIO_HREF, projectHref, TRASH_HREF } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import type { ISODate, Project } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const AT = '2026-05-01T10:00:00.000Z';
const piano = makeProject({ id: '00000000-0000-4000-8000-0000000000d1', title: 'Piano' });
const casa = makeProject({
  id: '00000000-0000-4000-8000-0000000000d2',
  title: 'Casa',
  status: 'completed',
});

async function renderApp(projects: Project[], hash = PORTFOLIO_HREF) {
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

function timelineTitles() {
  return screen
    .queryAllByRole('listitem')
    .filter((item) => item.closest('section[aria-label="Horizontes"]'))
    .map((item) => item.textContent.replace(/\d+%$/, ''));
}

async function stored(id: string) {
  const project = await projectRepository.get(id);
  if (!project) throw new Error('missing');
  return project;
}

function openDrawer(project: Project) {
  act(() => {
    useDrawerStore.getState().openProject(project.id);
  });
  return within(screen.getByRole('dialog'));
}

function notice() {
  return within(screen.getAllByRole('status').find((item) => item.textContent) ?? document.body);
}

describe('visibility and trash flows', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await scheduleRepository.replaceAll([]);
    useDrawerStore.getState().close();
    useNoticeStore.getState().dismiss();
    useScheduleStore.getState().close();
  });

  it('hides a project from the timeline, lists it in "Ocultos" and shows it again', async () => {
    const user = userEvent.setup();
    await renderApp([piano, casa]);
    expect(timelineTitles().sort()).toEqual(['Casa', 'Piano']);

    await user.click(openDrawer(piano).getByRole('button', { name: 'Ocultar' }));
    await waitFor(() => {
      expect(timelineTitles()).toEqual(['Casa']);
    });
    expect(notice().getByText('“Piano” foi ocultado.')).toBeInTheDocument();
    expect((await stored(piano.id)).hiddenAt).not.toBeNull();
    expect(await stored(piano.id)).toMatchObject({ status: 'planned', deletedAt: null });

    await user.click(screen.getByRole('button', { name: 'Ocultos e lixeira' }));
    expect(await screen.findByRole('menuitem', { name: /Ocultos\s*1/ })).toBeInTheDocument();
    act(() => {
      window.location.hash = HIDDEN_HREF;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    const list = within(await screen.findByRole('list', { name: 'Projetos ocultos' }));
    expect(list.getByText('Piano')).toBeInTheDocument();
    expect(list.getByText('Planejado')).toBeInTheDocument();
    await user.click(list.getByRole('button', { name: 'Reexibir' }));
    await waitFor(() => {
      expect(screen.getByText('Nenhum projeto oculto.')).toBeInTheDocument();
    });
    expect((await stored(piano.id)).hiddenAt).toBeNull();
  });

  it('undoes a hide from the notice', async () => {
    const user = userEvent.setup();
    await renderApp([piano]);
    await user.click(openDrawer(piano).getByRole('button', { name: 'Ocultar' }));
    await user.click(notice().getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => {
      expect(timelineTitles()).toEqual(['Piano']);
    });
    await waitFor(async () => {
      expect((await stored(piano.id)).hiddenAt).toBeNull();
    });
  });

  it('moves a deleted project to the trash with its data, and undoes it', async () => {
    const user = userEvent.setup();
    await renderApp([piano, casa]);

    await user.click(openDrawer(piano).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => {
      expect(timelineTitles()).toEqual(['Casa']);
    });
    const trashed = await stored(piano.id);
    expect(trashed.deletedAt).not.toBeNull();
    expect(trashed).toMatchObject({ title: 'Piano', startDate: piano.startDate });

    await user.click(notice().getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => {
      expect(timelineTitles().sort()).toEqual(['Casa', 'Piano']);
    });
  });

  it('restores a hidden project from the trash back to "Ocultos"', async () => {
    const user = userEvent.setup();
    await renderApp([{ ...casa, hiddenAt: AT, deletedAt: AT }, piano], TRASH_HREF);

    const list = within(await screen.findByRole('list', { name: 'Lixeira' }));
    expect(list.getByText('Concluído')).toBeInTheDocument();
    await user.click(list.getByRole('button', { name: 'Restaurar' }));
    await waitFor(async () => {
      expect(await stored(casa.id)).toMatchObject({
        hiddenAt: AT,
        deletedAt: null,
        status: 'completed',
      });
    });
    expect(screen.getByText('A lixeira está vazia.')).toBeInTheDocument();
  });

  it('deletes permanently from the trash only, with its schedule', async () => {
    const user = userEvent.setup();
    await scheduleRepository.replaceAll([
      createIndustrialSchedule({
        projectId: piano.id,
        start: '2026-11-23' as ISODate,
        generateId: (key) => `v-${key}`,
      }),
    ]);
    await renderApp([{ ...piano, deletedAt: AT }], TRASH_HREF);

    await user.click(await screen.findByRole('button', { name: 'Excluir permanentemente' }));
    const confirm = within(await screen.findByRole('alertdialog'));
    expect(confirm.getByText(/não pode ser desfeita/)).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Excluir permanentemente' }));

    await waitFor(async () => {
      expect(await projectRepository.get(piano.id)).toBeNull();
    });
    await waitFor(async () => {
      expect(await scheduleRepository.get(piano.id)).toBeNull();
    });
  });

  it('never offers to replace data when every project is hidden or trashed', async () => {
    await renderApp([
      { ...piano, hiddenAt: AT },
      { ...casa, deletedAt: AT },
    ]);
    expect(screen.getByRole('heading', { name: 'Nenhum projeto visível' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Carregar dados de exemplo' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the filters to visible projects', async () => {
    const user = userEvent.setup();
    await renderApp([piano, { ...casa, hiddenAt: AT }]);
    await user.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.getByRole('menuitemcheckbox', { name: /^Concluído/ })).toHaveTextContent(/0$/);
  });

  it('opens a hidden project by URL, and a trashed one read-only', async () => {
    const schedule = createIndustrialSchedule({
      projectId: piano.id,
      start: '2026-11-23' as ISODate,
      generateId: (key) => `w-${key}`,
    });
    await scheduleRepository.replaceAll([schedule]);
    const { unmount } = await renderApp([{ ...piano, hiddenAt: AT }], projectHref(piano.id));
    await screen.findByRole('treegrid');
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeEnabled();
    unmount();
    useScheduleStore.getState().close();

    await renderApp([{ ...piano, deletedAt: AT }], projectHref(piano.id));
    await screen.findByRole('treegrid');
    expect(screen.getByText(/Projeto na lixeira/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeDisabled();
  });
});

import {
  act,
  type BoundFunctions,
  type queries,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { useWorkspaceUiStore } from '@/features/workspace/store/workspaceUiStore';
import { PORTFOLIO_HREF, projectHref } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const industrial = makeProject({
  id: '00000000-0000-4000-8000-0000000000e1',
  title: 'Implantação de Sistema Industrial',
  status: 'in_progress',
  startDate: '2026-11-23' as ISODate,
  endDate: '2026-12-23' as ISODate,
});
const schedule = createIndustrialSchedule({
  projectId: industrial.id,
  start: '2026-11-23' as ISODate,
  generateId: (key) => `x-${key}`,
});

async function renderPortfolio() {
  window.location.hash = PORTFOLIO_HREF;
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
}

async function openExpanded(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(industrial.title, { selector: 'li button span' }));
  const trigger = await screen.findByRole('button', { name: 'Abrir cronograma' });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: `Cronograma de ${industrial.title}` });
  await within(dialog).findByRole('treegrid');
  return { dialog: within(dialog), trigger };
}

function cellIn(dialog: BoundFunctions<typeof queries>, name: string, column: number) {
  const row = dialog
    .getAllByRole('row')
    .find((item) => within(item).queryByText(name, { exact: true }));
  const found = row ? within(row).getAllByRole('gridcell')[column] : undefined;
  if (!found) throw new Error(`Cell ${name}/${String(column)} not found`);
  return found;
}

describe('expanded project dialog', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await projectRepository.replaceAll([industrial]);
    await scheduleRepository.replaceAll([schedule]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.setState({ view: { mode: 'closed' }, expandedProjectId: null });
    useNoticeStore.getState().dismiss();
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
  });

  it('shows the real workspace without changing the route, and closes back to the page', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    const { dialog, trigger } = await openExpanded(user);

    expect(window.location.hash).toBe(PORTFOLIO_HREF);
    expect(
      dialog.getByRole('treegrid', { name: `Tarefas de ${industrial.title}` }),
    ).toBeInTheDocument();
    expect(dialog.getByRole('link', { name: 'Abrir página completa' })).toHaveAttribute(
      'href',
      projectHref(industrial.id),
    );
    // A single page landmark: the dialog does not add a second `main`.
    expect(document.querySelectorAll('main')).toHaveLength(1);

    await user.click(dialog.getByRole('button', { name: 'Fechar visualização ampliada' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: `Cronograma de ${industrial.title}` }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(window.location.hash).toBe(PORTFOLIO_HREF);
    // The project panel it was opened from is still there.
    expect(screen.getByRole('region', { name: 'Status do projeto' })).toBeInTheDocument();
  });

  it('saves edits made in the dialog, and the full page shows the same data', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    const { dialog } = await openExpanded(user);

    await user.dblClick(cellIn(dialog, 'Levantamento técnico', 2));
    const input = dialog.getByRole('textbox', { name: 'Duração de 1.1 Levantamento técnico' });
    await user.clear(input);
    await user.type(input, '4{Enter}');
    await waitFor(async () => {
      const stored = await scheduleRepository.get(industrial.id);
      expect(stored?.tasks.find((task) => task.id === 'x-A')?.duration).toBe(4);
    });

    await user.click(dialog.getByRole('link', { name: 'Abrir página completa' }));
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: `Cronograma de ${industrial.title}` }),
      ).not.toBeInTheDocument();
    });
    await screen.findByRole('treegrid');
    expect(screen.getByRole('heading', { level: 1, name: industrial.title })).toBeInTheDocument();
    const row = screen
      .getAllByRole('row')
      .find((item) => within(item).queryByText('Levantamento técnico', { exact: true }));
    expect(row && within(row).getAllByRole('gridcell')[2]).toHaveTextContent('4 dias');
  });

  it('lets Escape cancel a cell edit first, then closes on the next Escape', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    const { dialog } = await openExpanded(user);

    await user.dblClick(cellIn(dialog, 'Levantamento técnico', 2));
    expect(dialog.getByRole('textbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: `Cronograma de ${industrial.title}` }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: `Cronograma de ${industrial.title}` }),
      ).not.toBeInTheDocument();
    });
  });

  it('keeps the page shortcuts quiet while it is open', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    await openExpanded(user);
    const before = useViewportStore.getState().viewport.pxPerDay;

    await user.keyboard('n');
    await user.keyboard('+');
    expect(useDrawerStore.getState().view.mode).toBe('edit');
    expect(useViewportStore.getState().viewport.pxPerDay).toBe(before);
  });

  it('asks before closing with changes that are not stored', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    const { dialog } = await openExpanded(user);
    act(() => {
      useScheduleStore.setState({ saveStatus: 'error' });
    });

    await user.click(dialog.getByRole('button', { name: 'Fechar visualização ampliada' }));
    const confirm = within(await screen.findByRole('alertdialog'));
    await user.click(confirm.getByRole('button', { name: 'Continuar editando' }));
    expect(
      screen.getByRole('dialog', { name: `Cronograma de ${industrial.title}` }),
    ).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Fechar visualização ampliada' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Fechar mesmo assim',
      }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: `Cronograma de ${industrial.title}` }),
      ).not.toBeInTheDocument();
    });
  });

  it('has no axe violations', async () => {
    const user = userEvent.setup();
    await renderPortfolio();
    await openExpanded(user);
    await expectNoAxeViolations(document.body);
  });
});

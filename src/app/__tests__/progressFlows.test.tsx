import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createEmptySchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import { useWorkspaceUiStore } from '@/features/workspace/store/workspaceUiStore';
import { projectHref } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import { buildOutline } from '@/test/schedule';
import type { ISODate } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

const project = makeProject({
  id: '00000000-0000-4000-8000-0000000000f1',
  title: 'Mudança de escritório',
  status: 'in_progress',
  startDate: '2026-11-23' as ISODate,
  endDate: '2026-12-04' as ISODate,
});

// Two phases of two tasks (very different durations) and a closing milestone.
const schedule = {
  ...createEmptySchedule(project.id),
  tasks: buildOutline([
    {
      key: 'Preparação',
      children: [
        { key: 'Inventário', task: { duration: 1 } },
        { key: 'Contratar transportadora', task: { duration: 8 } },
      ],
    },
    {
      key: 'Mudança',
      children: [
        { key: 'Embalar', task: { duration: 2 } },
        { key: 'Transportar', task: { duration: 1 } },
      ],
    },
    { key: 'Entrega das chaves', task: { duration: 0 } },
  ]),
};

async function openWorkspace() {
  window.location.hash = projectHref(project.id);
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
  return screen.findByRole('treegrid');
}

function cell(name: string, column: number) {
  const row = screen
    .getAllByRole('row')
    .find((item) => within(item).queryByText(name, { exact: true }));
  const found = row ? within(row).getAllByRole('gridcell')[column] : undefined;
  if (!found) throw new Error(`Cell ${name}/${String(column)} not found`);
  return found;
}

const PROGRESS = 7;

async function setProgress(user: ReturnType<typeof userEvent.setup>, name: string, value: number) {
  await user.dblClick(cell(name, PROGRESS));
  const input = screen.getByRole('textbox', { name: new RegExp(`^Progresso de .*${name}`) });
  await user.clear(input);
  await user.type(input, `${String(value)}{Enter}`);
}

async function storedProgress() {
  return (await projectRepository.get(project.id))?.progress;
}

describe('task-based progress', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await projectRepository.replaceAll([project]);
    await scheduleRepository.replaceAll([schedule]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.setState({ view: { mode: 'closed' }, expandedProjectId: null });
    useNoticeStore.getState().dismiss();
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
  });

  it('shows the same task-based percentage in the table, the header and the portfolio', async () => {
    const user = userEvent.setup();
    await openWorkspace();

    await setProgress(user, 'Inventário', 100);
    // 4 tasks (the milestone is a checkpoint), 1 done: 25%, whatever the durations.
    expect(cell('Preparação', PROGRESS)).toHaveTextContent('50%');
    expect(cell('Mudança', PROGRESS)).toHaveTextContent('0%');
    expect(screen.getByText(/1 de 4 tarefas concluídas/)).toBeInTheDocument();
    await waitFor(async () => {
      expect(await storedProgress()).toBe(25);
    });

    await setProgress(user, 'Embalar', 100);
    await waitFor(async () => {
      expect(await storedProgress()).toBe(50);
    });
    expect(screen.getByText(/2 de 4 tarefas concluídas/)).toBeInTheDocument();

    // Reopening a task brings the project back down.
    await setProgress(user, 'Embalar', 0);
    await waitFor(async () => {
      expect(await storedProgress()).toBe(25);
    });

    // The summary bar keeps its shape; the task bar fill matches the table.
    const inventory = schedule.tasks.find((task) => task.name === 'Inventário');
    const bar = document.querySelector<HTMLElement>(`[data-bar-id="${inventory?.id ?? ''}"]`);
    expect((bar?.firstElementChild as HTMLElement | null)?.style.width).toBe('100%');
  });
});

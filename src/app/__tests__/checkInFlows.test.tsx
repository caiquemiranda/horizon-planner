import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { createWorkCalendar, DEFAULT_CALENDAR } from '@/features/schedule/lib/calendar';
import { createEmptySchedule } from '@/features/schedule/lib/fixtures';
import { useScheduleStore } from '@/features/schedule/store';
import { dayToIsoDate, getTodayIsoDate, isoDateToDay } from '@/features/timeline/lib/time';
import { useWorkspaceUiStore } from '@/features/workspace/store/workspaceUiStore';
import { projectHref } from '@/lib/router';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { makeProject } from '@/test/factories';
import { buildOutline, taskId } from '@/test/schedule';
import type { Project } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

// Dates relative to the day the tests run: the last working day up to today.
const calendar = createWorkCalendar(DEFAULT_CALENDAR);
const todayDay = isoDateToDay(getTodayIsoDate());
let workDay = todayDay;
while (!calendar.isWorkingDay(workDay)) workDay -= 1;
const workDate = dayToIsoDate(workDay);
const weekEarlier = dayToIsoDate(workDay - 7);

const project = makeProject({
  id: '00000000-0000-4000-8000-0000000000a6',
  title: 'Reforma do escritório',
  status: 'in_progress',
  startDate: weekEarlier,
  endDate: dayToIsoDate(workDay + 14),
});

const schedule = {
  ...createEmptySchedule(project.id),
  tasks: buildOutline([
    {
      key: 'Obra',
      children: [
        { key: 'Pintura', task: { name: 'Pintura', start: workDate, duration: 5 } },
        { key: 'Limpeza', task: { name: 'Limpeza', start: weekEarlier, duration: 1 } },
      ],
    },
  ]),
};

async function openWorkspace(target: Project = project) {
  window.location.hash = projectHref(target.id);
  render(
    <Providers>
      <App />
    </Providers>,
  );
  await waitFor(() => {
    expect(useProjectsStore.getState().status).toBe('ready');
  });
  await screen.findByRole('treegrid');
}

async function openDaily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Atividades do dia/ }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Atividades do dia' }));
  fireEvent.change(dialog.getByLabelText('Dia do trabalho'), { target: { value: workDate } });
  return dialog;
}

async function storedTask(key: string) {
  const stored = await scheduleRepository.get(project.id);
  return {
    task: stored?.tasks.find((task) => task.id === taskId(key)),
    checkIns: stored?.checkIns.filter((checkIn) => checkIn.taskId === taskId(key)) ?? [],
  };
}

describe('daily check-ins', () => {
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

  it('confirms one day of a 5-day task: 20%, not closed, saved, and undoable', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const dialog = await openDaily(user);

    const planned = within(dialog.getByRole('region', { name: 'Previstas para o dia' }));
    expect(planned.getByText('Pendente de confirmação')).toBeInTheDocument();
    await user.click(planned.getByRole('button', { name: 'Feito (1 dia): 1.1 Pintura' }));

    expect(planned.getByText(/Feito \(1 dia\)/)).toBeInTheDocument();
    expect(planned.getByText(/20% · 1 dia de 5 dias/)).toBeInTheDocument();
    await waitFor(async () => {
      const { task, checkIns } = await storedTask('Pintura');
      expect(task).toMatchObject({ completedWork: 1, progress: 20, actualFinish: null });
      expect(checkIns).toEqual([expect.objectContaining({ workDate, state: 'done', units: 1 })]);
    });

    await user.click(planned.getByRole('button', { name: 'Desfazer confirmação: 1.1 Pintura' }));
    await waitFor(async () => {
      const { task, checkIns } = await storedTask('Pintura');
      expect(task).toMatchObject({ completedWork: 0, progress: 0 });
      expect(checkIns).toEqual([]);
    });
  });

  it('lists a late task and completes it, which the table and the project reflect', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const dialog = await openDaily(user);

    const late = within(dialog.getByRole('region', { name: 'Atrasadas' }));
    expect(late.getByText('Atrasada')).toBeInTheDocument();
    await user.click(late.getByRole('button', { name: 'Concluir tarefa: 1.2 Limpeza' }));

    await waitFor(async () => {
      expect((await storedTask('Limpeza')).task).toMatchObject({
        progress: 100,
        actualFinish: workDate,
      });
    });
    expect(dialog.queryByRole('region', { name: 'Atrasadas' })).not.toBeInTheDocument();
    // Pintura 0% and Limpeza 100%: the phase (and the project) at 50%.
    await waitFor(async () => {
      expect((await projectRepository.get(project.id))?.progress).toBe(50);
    });
  });

  it('records "not done" for an earlier day without adding work', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const dialog = await openDaily(user);
    fireEvent.change(dialog.getByLabelText('Dia do trabalho'), { target: { value: weekEarlier } });
    expect(dialog.getByText(/Registro retroativo/)).toBeInTheDocument();

    const planned = within(dialog.getByRole('region', { name: 'Previstas para o dia' }));
    await user.click(planned.getByRole('button', { name: 'Não realizado: 1.2 Limpeza' }));
    await waitFor(async () => {
      const { task, checkIns } = await storedTask('Limpeza');
      expect(task?.completedWork).toBe(0);
      expect(checkIns).toEqual([
        expect.objectContaining({ workDate: weekEarlier, state: 'not_done', units: 0 }),
      ]);
    });
  });

  it('only shows the activities of a closed project', async () => {
    const user = userEvent.setup();
    const closed = { ...project, status: 'completed' as const };
    await projectRepository.replaceAll([closed]);
    await openWorkspace(closed);
    const dialog = await openDaily(user);
    expect(dialog.getByRole('button', { name: 'Feito (1 dia): 1.1 Pintura' })).toBeDisabled();
  });
});

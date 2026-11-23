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
import { makeLink, makeTask, taskId } from '@/test/schedule';
import type { ISODate, Project } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

// A → B → C, one working day each, ending on the last working day up to today: A and B are
// already in the past and nothing is confirmed, so the forecast is late.
const calendar = createWorkCalendar(DEFAULT_CALENDAR);
const previousWorkingDay = (day: number) => calendar.previousWorkingDay(day - 1);
const last = calendar.previousWorkingDay(isoDateToDay(getTodayIsoDate()));
const dayB = previousWorkingDay(last);
const dayA = previousWorkingDay(dayB);
const dateA = dayToIsoDate(dayA);
const dateB = dayToIsoDate(dayB);

const project = makeProject({
  id: '00000000-0000-4000-8000-0000000000b7',
  title: 'Lançamento do site',
  status: 'in_progress',
  startDate: dateA,
  endDate: dayToIsoDate(last + 30),
});

const schedule = {
  ...createEmptySchedule(project.id),
  tasks: ['A', 'B', 'C'].map((key, order) =>
    makeTask({ id: taskId(key), name: `Etapa ${key}`, order, start: dateA, duration: 1 }),
  ),
  dependencies: [makeLink('A', 'B'), makeLink('B', 'C')],
};

async function openWorkspace(target: Project = project) {
  await projectRepository.replaceAll([target]);
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
  return within(screen.getByRole('group', { name: 'Previsão de término' }));
}

async function confirm(user: ReturnType<typeof userEvent.setup>, date: ISODate, name: string) {
  await user.click(screen.getByRole('button', { name: /^Atividades do dia/ }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Atividades do dia' }));
  fireEvent.change(dialog.getByLabelText('Dia do trabalho'), { target: { value: date } });
  await user.click(dialog.getByRole('button', { name: `Feito (1 dia): ${name}` }));
  await user.keyboard('{Escape}');
}

describe('finish forecast', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await scheduleRepository.replaceAll([schedule]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.setState({ view: { mode: 'closed' }, expandedProjectId: null });
    useNoticeStore.getState().dismiss();
    useScheduleStore.getState().close();
    useWorkspaceUiStore.getState().load('none');
  });

  it('shows the planned finish and a later forecast, explained by the late task', async () => {
    const user = userEvent.setup();
    const strip = await openWorkspace();
    expect(strip.getByText(/Término planejado/)).toBeInTheDocument();
    expect(strip.getByText(/^\+\d+ dias? úte(l|is)$/)).toBeInTheDocument();

    await user.click(strip.getByRole('button', { name: 'Detalhes da previsão' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Previsão de término' }));
    const reasons = within(dialog.getByRole('region', { name: 'Motivos' }));
    expect(
      reasons.getByText(/1 Etapa A: trabalho previsto ainda não confirmado/),
    ).toBeInTheDocument();
    expect(dialog.getByText('Não salva')).toBeInTheDocument();
  });

  it('saves a baseline that stays when the plan changes', async () => {
    const user = userEvent.setup();
    const strip = await openWorkspace();
    await user.click(strip.getByRole('button', { name: 'Detalhes da previsão' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Previsão de término' }));
    await user.click(dialog.getByRole('button', { name: 'Salvar linha de base' }));

    await waitFor(async () => {
      expect((await scheduleRepository.get(project.id))?.baseline?.finish).toBe(dayToIsoDate(last));
    });
    expect(dialog.getByRole('button', { name: 'Atualizar linha de base' })).toBeInTheDocument();
    expect(strip.getByText(/Linha de base/)).toBeInTheDocument();
  });

  it('confirming the earlier days afterwards brings the forecast back', async () => {
    const user = userEvent.setup();
    const strip = await openWorkspace();
    const before = strip.getByText(/^\+\d+ dias? úte(l|is)$/).textContent;

    await confirm(user, dateA, '1 Etapa A');
    await confirm(user, dateB, '2 Etapa B');

    await waitFor(() => {
      expect(strip.queryByText(before)).not.toBeInTheDocument();
    });
    await user.click(strip.getByRole('button', { name: 'Detalhes da previsão' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Previsão de término' }));
    expect(dialog.queryByText(/Etapa A: trabalho previsto/)).not.toBeInTheDocument();
  });

  it('suspends the forecast of a postponed project', async () => {
    const strip = await openWorkspace({ ...project, status: 'paused' });
    expect(strip.getByText('Previsão suspensa: projeto adiado')).toBeInTheDocument();
  });
});

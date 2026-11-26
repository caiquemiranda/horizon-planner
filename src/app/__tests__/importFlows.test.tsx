import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildProjectWorkbook } from '@/features/data-io/lib/wbsWorkbook';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { computeSchedule } from '@/features/schedule/lib/engine';
import { createIndustrialSchedule } from '@/features/schedule/lib/fixtures';
import { IMPORT_HREF } from '@/lib/router';
import { writeXlsx } from '@/lib/spreadsheet/xlsxWriter';
import { projectRepository, scheduleRepository } from '@/services/persistence';
import { expectNoAxeViolations } from '@/test/axe';
import { makeProject } from '@/test/factories';
import type { ISODate } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

async function renderImport() {
  window.location.hash = IMPORT_HREF;
  await projectRepository.replaceAll([]);
  await scheduleRepository.replaceAll([]);
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
  return screen.findByRole('heading', { name: 'Importar projeto de planilha' });
}

function exportedWorkbook(): File {
  const project = makeProject({ title: 'Implantação SDAI' });
  const schedule = createIndustrialSchedule({
    projectId: project.id,
    start: '2026-11-23' as ISODate,
    generateId: (key) => `k-${key}`,
  });
  const bytes = writeXlsx(buildProjectWorkbook(project, schedule, computeSchedule(schedule), null));
  return new File([bytes as BlobPart], 'sdai.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('spreadsheet import preview', () => {
  beforeEach(() => {
    // Reading a workbook loads the zip library on demand: slow when the whole suite runs.
    configure({ asyncUtilTimeout: 5000 });
    window.localStorage.clear();
  });

  it('previews an exported workbook with its counts and structure, writing nothing', async () => {
    const user = userEvent.setup();
    await renderImport();
    await user.upload(screen.getByLabelText('Arquivo da planilha'), exportedWorkbook());

    const summary = within(await screen.findByRole('region', { name: 'Resumo da importação' }));
    expect(summary.getByText('Projeto “Implantação SDAI”')).toBeInTheDocument();
    expect(
      summary.getByText(/4 fase\(s\), 9 tarefa\(s\), 1 marco\(s\) e 8 vínculo\(s\)/),
    ).toBeInTheDocument();
    expect(summary.getByText('Pronto para importar.')).toBeInTheDocument();
    const structure = within(screen.getByRole('region', { name: 'Estrutura' }));
    expect(structure.getByText('Levantamento técnico')).toBeInTheDocument();
    expect(structure.getAllByRole('row')).toHaveLength(15);
    // Nothing is saved in this phase.
    expect(await projectRepository.list()).toEqual([]);
  });

  it('imports the previewed project once and opens its schedule', async () => {
    const user = userEvent.setup();
    await renderImport();
    // One file for both uploads: two exports differ (generation time), so they are two files.
    const file = exportedWorkbook();
    await user.upload(screen.getByLabelText('Arquivo da planilha'), file);
    await user.click(await screen.findByRole('button', { name: 'Importar projeto' }));

    const outcome = within(await screen.findByRole('region', { name: 'Resultado da importação' }));
    expect(outcome.getByText('Projeto “Implantação SDAI” importado')).toBeInTheDocument();
    expect(outcome.getByRole('status')).toHaveTextContent(
      /^Foram criados 4 fase\(s\), 9 tarefa\(s\), 1 marco\(s\) e 8 vínculo\(s\), com \d aviso/,
    );
    const [project] = await projectRepository.list();
    expect(project?.title).toBe('Implantação SDAI');
    expect((await scheduleRepository.get(project?.id ?? ''))?.tasks).toHaveLength(14);

    // The same file again: nothing new is written, the existing project is offered.
    await user.upload(screen.getByLabelText('Arquivo da planilha'), file);
    await user.click(await screen.findByRole('button', { name: 'Importar projeto' }));
    expect(await screen.findByText('Este arquivo já foi importado')).toBeInTheDocument();
    expect(await projectRepository.list()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Abrir cronograma' }));
    expect(
      await screen.findByRole('dialog', { name: /Cronograma de Implantação SDAI/ }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(IMPORT_HREF);
  });

  it('lists blocking errors by row and lets the user remap columns', async () => {
    const user = userEvent.setup();
    await renderImport();
    const csv = 'Código;Tarefa;Pai;Duração\nA;Fundação;;3\nB;Paredes;X;2\nC;;A;-1\n';
    await user.upload(
      screen.getByLabelText('Arquivo da planilha'),
      new File([csv], 'obra.csv', { type: 'text/csv' }),
    );

    const problems = within(await screen.findByRole('region', { name: 'Problemas encontrados' }));
    expect(problems.getByText(/linha 3, codigo_pai: Pai “X” não existe/)).toBeInTheDocument();
    expect(problems.getByText(/linha 4, nome: Nome vazio/)).toBeInTheDocument();
    expect(problems.getByText(/linha 4, duracao_dias_uteis: Duração deve ser/)).toBeInTheDocument();
    expect(screen.getByText(/erro\(s\) impedem a importação/)).toBeInTheDocument();

    // Unmapping the parent column removes the parent error.
    await user.selectOptions(screen.getByLabelText('Código do pai'), '');
    await waitFor(() => {
      expect(screen.queryByText(/Pai “X” não existe/)).not.toBeInTheDocument();
    });
  });

  it('explains files it cannot read', async () => {
    const user = userEvent.setup();
    await renderImport();
    await user.upload(
      screen.getByLabelText('Arquivo da planilha'),
      new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])], 'renomeado.xlsx'),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/formato antigo \.xls/);
  });

  it('has no axe violations with a preview', async () => {
    const user = userEvent.setup();
    await renderImport();
    await user.upload(screen.getByLabelText('Arquivo da planilha'), exportedWorkbook());
    await screen.findByRole('region', { name: 'Resumo da importação' });
    await expectNoAxeViolations(document.body);
  });
});

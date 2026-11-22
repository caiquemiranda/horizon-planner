import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBackup, serializeBackup } from '@/features/data-io/lib/backup';
import { useNoticeStore } from '@/features/data-io/store/noticeStore';
import { useFiltersStore } from '@/features/filters/store/filtersStore';
import { useDrawerStore } from '@/features/projects/store/drawerStore';
import { useProjectsStore } from '@/features/projects/store/projectsStore';
import { useViewportStore } from '@/features/timeline/store/viewportStore';
import { projectRepository } from '@/services/persistence';
import { makeDraft } from '@/services/persistence/__tests__/helpers';
import { makeProject } from '@/test/factories';
import type { HorizonSnapshot } from '@/types/project';

import { App } from '../App';
import { Providers } from '../providers';

type User = ReturnType<typeof userEvent.setup>;

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

async function chooseDataAction(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: 'Dados' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

function backupFile(snapshot: HorizonSnapshot | string, name = 'backup.json') {
  const content = typeof snapshot === 'string' ? snapshot : serializeBackup(snapshot);
  return new File([content], name, { type: 'application/json' });
}

async function storedTitles() {
  return (await projectRepository.list()).map((project) => project.title);
}

describe('data flows', () => {
  beforeEach(async () => {
    await projectRepository.replaceAll([]);
    useProjectsStore.setState({ projects: [], status: 'idle', error: null });
    useDrawerStore.getState().close();
    useFiltersStore.getState().clearAll();
    useNoticeStore.getState().dismiss();
    useViewportStore.getState().setViewport({ startDay: 20_500, pxPerDay: 6.5, widthPx: 1000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the sample data from the empty state', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Carregar dados de exemplo' }));

    await waitFor(async () => {
      expect(await storedTitles()).toContain('Reforma da cozinha');
    });
    expect(screen.getByRole('list', { name: 'Projetos de longo prazo' })).toHaveTextContent(
      'Mestrado',
    );
    expect(screen.getByText('Dados de exemplo carregados.')).toBeInTheDocument();
  });

  it('asks before replacing projects with the sample data', async () => {
    const user = userEvent.setup();
    await projectRepository.create(makeDraft({ title: 'Piano' }));
    await renderApp();

    await chooseDataAction(user, 'Carregar dados de exemplo');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'O projeto atual será substituído pelos projetos de exemplo. Exporte um backup antes se quiser guardá-lo.',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await storedTitles()).toEqual(['Piano']);
  });

  it('exports every project as a JSON backup', async () => {
    const user = userEvent.setup();
    await projectRepository.create(makeDraft({ title: 'Piano' }));
    await renderApp();

    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value;
      return 'blob:backup';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      // jsdom does not navigate.
    });

    await chooseDataAction(user, 'Exportar JSON');

    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toMatch(
      /^horizon-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const exported = blob;
    if (!exported) throw new Error('Nothing was exported.');
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        resolve(reader.result as string);
      });
      reader.readAsText(exported);
    });
    expect(JSON.parse(text)).toMatchObject({
      schemaVersion: 1,
      projects: [{ title: 'Piano' }],
    });
    expect(screen.getByText('Backup exportado com 1 projeto.')).toBeInTheDocument();
  });

  it('imports a backup after confirmation and shows everything', async () => {
    const user = userEvent.setup();
    await projectRepository.create(makeDraft({ title: 'Piano' }));
    await renderApp();
    useFiltersStore.getState().toggleStatus('paused');

    const imported = [makeProject({ title: 'Viagem' }), makeProject({ title: 'Mudança' })];
    await user.upload(
      screen.getByLabelText('Arquivo de backup'),
      backupFile(createBackup(imported), 'meu-backup.json'),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('pelo conteúdo de “meu-backup.json” (2 projetos)');
    await user.click(within(dialog).getByRole('button', { name: 'Importar e substituir' }));

    await waitFor(async () => {
      expect(await storedTitles()).toEqual(['Viagem', 'Mudança']);
    });
    expect(useFiltersStore.getState().filters.statuses).toEqual([]);
    expect(screen.getByText('Backup importado com 2 projetos.')).toBeInTheDocument();
  });

  it('imports straight away when there is nothing to replace', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.upload(
      screen.getByLabelText('Arquivo de backup'),
      backupFile(createBackup([makeProject({ title: 'Viagem' })])),
    );

    await waitFor(async () => {
      expect(await storedTitles()).toEqual(['Viagem']);
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('explains why an invalid backup cannot be imported', async () => {
    const user = userEvent.setup();
    await projectRepository.create(makeDraft({ title: 'Piano' }));
    await renderApp();

    const invalid = createBackup([makeProject({ title: '' })]);
    await user.upload(screen.getByLabelText('Arquivo de backup'), backupFile(invalid));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Não foi possível importar');
    expect(dialog).toHaveTextContent('Projeto 1 (title): O título é obrigatório.');

    await user.click(within(dialog).getByRole('button', { name: 'Entendi' }));
    expect(await storedTitles()).toEqual(['Piano']);
  });

  it('rejects files that are not JSON', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.upload(screen.getByLabelText('Arquivo de backup'), backupFile('not json'));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'O arquivo não é um JSON válido.',
    );
  });

  it('clears every project after confirmation', async () => {
    const user = userEvent.setup();
    await projectRepository.create(makeDraft({ title: 'Piano' }));
    await renderApp();

    await chooseDataAction(user, 'Apagar todos os projetos');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('não pode ser desfeita');
    await user.click(within(dialog).getByRole('button', { name: 'Apagar tudo' }));

    expect(
      await screen.findByRole('heading', { name: 'Sua linha do tempo está vazia' }),
    ).toBeInTheDocument();
    expect(await storedTitles()).toEqual([]);
  });

  it('disables export and clear without projects', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Dados' }));

    expect(await screen.findByRole('menuitem', { name: 'Exportar JSON' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Apagar todos os projetos' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

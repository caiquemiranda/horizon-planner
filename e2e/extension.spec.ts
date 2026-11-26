import { expect, type Locator, type Page, test } from '@playwright/test';

import { cell, maxRowBarOffset, openSamplePortfolio, openSampleSchedule } from './helpers';

/**
 * Cross-module scenarios of the project lifecycle extension (status, sidebar, hide and
 * trash, expanded dialog, task-based progress, daily check-ins and the forecast), run in
 * the real browser on the production build.
 */

function nav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Seções' });
}

/** The count shown next to a section, from its accessible name ("Ativos, 8 projetos"). */
async function countOf(page: Page, section: RegExp): Promise<number> {
  const label = await nav(page).getByRole('link', { name: section }).getAttribute('aria-label');
  return Number(/(\d+) projetos?$/.exec(label ?? '')?.[1] ?? Number.NaN);
}

async function goTo(page: Page, section: RegExp) {
  await nav(page).getByRole('link', { name: section }).click();
}

async function openPanel(page: Page, title: string) {
  await page
    .getByRole('region', { name: 'Linha do tempo' })
    .getByRole('button', { name: title })
    .click();
  return page.getByRole('region', { name: 'Status do projeto' });
}

async function changeStatus(page: Page, title: string, action: string) {
  const section = await openPanel(page, title);
  await section.getByRole('button', { name: 'Alterar status' }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading') })
    .last();
}

async function completedOnDashboard(page: Page): Promise<string> {
  await page.goto('./#/painel');
  const term = page.getByText('Projetos concluídos', { exact: true });
  return (await term.locator('xpath=following-sibling::dd[1]').textContent()) ?? '';
}

test.describe('project experience', () => {
  test('scenario A: lifecycle, sections, hidden projects and the trash', async ({ page }) => {
    const title = 'Certificação AWS';
    await openSamplePortfolio(page);
    await goTo(page, /^Ativos/);
    await expect(
      page.getByRole('region', { name: 'Linha do tempo' }).getByRole('button', { name: title }),
    ).toBeVisible();

    // Start, postpone with a forecast, resume.
    let dialog = await changeStatus(page, title, 'Iniciar');
    await dialog.getByRole('button', { name: 'Iniciar' }).click();
    dialog = await changeStatus(page, title, 'Adiar');
    await dialog.getByLabel('Motivo').fill('Aguardando voucher da prova');
    const resume = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await dialog.getByLabel('Previsão de retomada').fill(resume);
    await dialog.getByRole('button', { name: 'Adiar' }).click();
    await expect(page.getByRole('region', { name: 'Status do projeto' })).toContainText('Adiado');
    await page.keyboard.press('Escape');
    await goTo(page, /^Adiados/);
    await expect(
      page.getByRole('region', { name: 'Linha do tempo' }).getByRole('button', { name: title }),
    ).toBeVisible();

    dialog = await changeStatus(page, title, 'Retomar');
    await dialog.getByRole('button', { name: 'Retomar' }).click();
    await page.keyboard.press('Escape');
    await goTo(page, /^Ativos/);
    await expect(
      page.getByRole('region', { name: 'Linha do tempo' }).getByRole('button', { name: title }),
    ).toBeVisible();

    // Complete: it moves to "Concluídos" and the dashboard counts it.
    const completedBefore = Number(await completedOnDashboard(page));
    await page.goto('./#/ativos');
    dialog = await changeStatus(page, title, 'Concluir');
    await dialog.getByRole('button', { name: 'Concluir' }).click();
    await page.keyboard.press('Escape');
    await goTo(page, /^Concluídos/);
    await expect(
      page.getByRole('region', { name: 'Linha do tempo' }).getByRole('button', { name: title }),
    ).toBeVisible();
    expect(Number(await completedOnDashboard(page))).toBe(completedBefore + 1);

    // Close another one without completing it.
    await page.goto('./#/ativos');
    dialog = await changeStatus(page, 'Side project SaaS', 'Encerrar sem concluir');
    await dialog.getByLabel('Motivo').fill('Sem tempo neste ano');
    await dialog.getByRole('button', { name: 'Encerrar' }).click();
    await page.keyboard.press('Escape');
    await goTo(page, /^Não concluídos/);
    await expect(
      page
        .getByRole('region', { name: 'Linha do tempo' })
        .getByRole('button', { name: 'Side project SaaS' }),
    ).toBeVisible();

    // Hide the completed project: out of "Concluídos", in "Ocultos", still counted.
    await goTo(page, /^Concluídos/);
    await openPanel(page, title);
    await page.getByRole('dialog').getByRole('button', { name: 'Ocultar' }).click();
    await expect(
      page.getByRole('region', { name: 'Linha do tempo' }).getByRole('button', { name: title }),
    ).toHaveCount(0);
    expect(await countOf(page, /^Ocultos/)).toBe(1);
    expect(Number(await completedOnDashboard(page))).toBe(completedBefore + 1);

    // Trash it from "Ocultos", restore it: back to "Ocultos" with its status.
    await page.goto('./#/ocultos');
    await page.getByRole('button', { name: `Mover “${title}” para a lixeira` }).click();
    await expect(page.getByText('Nenhum projeto oculto.')).toBeVisible();
    expect(Number(await completedOnDashboard(page))).toBe(completedBefore);
    await page.goto('./#/lixeira');
    await page.getByRole('button', { name: 'Restaurar' }).click();
    await page.goto('./#/ocultos');
    const hidden = page.getByRole('list', { name: 'Projetos ocultos' });
    await expect(hidden).toContainText(title);
    await expect(hidden).toContainText('Concluído');

    // Collapsed sidebar: every destination still reachable, and remembered.
    await page.getByRole('button', { name: 'Recolher menu' }).click();
    await expect(nav(page).getByRole('link')).toHaveCount(9);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
    await nav(page)
      .getByRole('link', { name: /^Lixeira/ })
      .click();
    await expect(page.getByText('A lixeira está vazia.')).toBeVisible();
  });

  test('scenario B: the expanded dialog shows the same project as the full page', async ({
    page,
  }) => {
    await openSamplePortfolio(page);
    const url = page.url();
    await page
      .getByRole('region', { name: 'Linha do tempo' })
      .getByRole('button', { name: 'Implantação de Sistema Industrial' })
      .click();
    const expand = page.getByRole('button', { name: 'Abrir cronograma' });
    await expand.click();
    const dialog = page.getByRole('dialog', { name: /Cronograma de/ });
    await expect(dialog.getByRole('treegrid')).toBeVisible();
    expect(page.url()).toBe(url);
    expect(await maxRowBarOffset(page)).toBeLessThanOrEqual(1);

    await cell(page, 'Levantamento técnico', 2).dblclick();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'Levantamento técnico', 2)).toHaveText('3 dias');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(expand).toBeFocused();

    await expand.click();
    await page.getByRole('link', { name: 'Abrir página completa' }).click();
    await expect(page.getByRole('treegrid')).toBeVisible();
    await expect(cell(page, 'Levantamento técnico', 2)).toHaveText('3 dias');
  });

  test('scenario C: a confirmation moves progress everywhere, survives a reload and is undone', async ({
    page,
  }) => {
    await openSampleSchedule(page);
    const header = page.locator('header');
    const counted = async () =>
      Number(/(\d+) de \d+ tarefas? concluídas?/.exec((await header.textContent()) ?? '')?.[1]);
    const before = await counted();
    await expect(page.getByRole('group', { name: 'Previsão de término' })).toBeVisible();

    await page.getByRole('button', { name: /^Atividades do dia/ }).click();
    const daily = page.getByRole('dialog', { name: 'Atividades do dia' });
    const complete = daily.getByRole('button', { name: /^Concluir tarefa: / }).first();
    // "Concluir tarefa: 1.2 Desenvolvimento do projeto" → WBS + name, and the name alone.
    const full = ((await complete.getAttribute('aria-label')) ?? '').replace(
      /^Concluir tarefa: /,
      '',
    );
    const name = full.replace(/^[\d.]+ /, '');
    await complete.click();
    await page.keyboard.press('Escape');

    await expect(cell(page, name, 7)).toHaveText('100%');
    expect(await counted()).toBe(before + 1);
    await page.reload();
    await expect(cell(page, name, 7)).toHaveText('100%');

    await page.getByRole('button', { name: /^Atividades do dia/ }).click();
    await daily.getByRole('button', { name: `Desfazer confirmação: ${full}` }).click();
    await page.keyboard.press('Escape');
    await expect(cell(page, name, 7)).not.toHaveText('100%');
    expect(await counted()).toBe(before);
  });

  test('scenario E: sample projects stay apart and can start a real project', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Explorar exemplos' }).click();
    await page.getByRole('button', { name: 'Explorar exemplos' }).click();
    const samples = page.getByRole('list', { name: 'Projetos de exemplo', exact: true });
    await expect(samples.getByRole('listitem')).toHaveCount(3);
    expect(await countOf(page, /^Exemplos/)).toBe(3);
    expect(await countOf(page, /^Todos os projetos/)).toBe(0);

    // A sample opens read-only, with its full plan.
    await samples.getByRole('link', { name: 'Implantação de SDAI na planta fabril' }).click();
    await expect(page.getByRole('treegrid')).toBeVisible();
    await expect(page.getByText(/Projeto de exemplo, com dados fictícios/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Nova tarefa/ })).toBeDisabled();

    // Its copy is a real, editable project with nothing of what happened in the sample.
    await page.goBack();
    await page
      .getByRole('button', {
        name: 'Criar projeto a partir de “Implantação de SDAI na planta fabril”',
      })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título do novo projeto').fill('SDAI planta 2');
    await dialog.getByRole('button', { name: 'Criar projeto' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SDAI planta 2');
    await expect(page.getByRole('button', { name: /Nova tarefa/ })).toBeEnabled();
    await expect(page.locator('header')).toContainText(/0 de \d+ tarefas concluídas/);
    expect(await countOf(page, /^Todos os projetos/)).toBe(1);
    expect(await countOf(page, /^Exemplos/)).toBe(3);
  });

  test('scenario F: the report shows the same plan as the workspace, whole', async ({ page }) => {
    await openSampleSchedule(page);
    const header = page.locator('header').first();
    const percent = /· (\d+)%/.exec((await header.textContent()) ?? '')?.[1];
    // Collapse a phase in the workspace: the report still lists every task.
    await page
      .getByRole('row')
      .filter({ hasText: 'Engenharia' })
      .first()
      .getByRole('button')
      .first()
      .click();

    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Implantação de Sistema Industrial',
    );
    await expect(page.getByText('Relatório de andamento', { exact: true })).toBeVisible();
    const indicators = page.getByRole('region', { name: 'Indicadores' });
    await expect(indicators.getByText(`${percent ?? '?'}%`, { exact: true })).toBeVisible();
    const wbs = page.getByRole('region', { name: 'Estrutura analítica (EAP)' });
    await expect(wbs.getByRole('row')).toHaveCount(15);
    await expect(wbs.getByText('Levantamento técnico')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Cronograma' })
        .getByRole('img', { name: /^Gráfico de Gantt/ }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Voltar ao projeto' }).click();
    await expect(page.getByRole('treegrid')).toBeVisible();
  });

  test('scenario G: the report prints as a light A4 document without the app around it', async ({
    page,
  }, testInfo) => {
    await openSampleSchedule(page);
    await page.getByRole('link', { name: 'Visualizar relatório' }).click();
    const printButton = page.getByRole('button', { name: 'Imprimir / Salvar em PDF' });
    await expect(printButton).toBeVisible();
    const tokens = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--background'),
      );
    const light = await page.evaluate(() => {
      const root = document.documentElement;
      const dark = root.classList.contains('dark');
      root.classList.remove('dark');
      const value = getComputedStyle(root).getPropertyValue('--background');
      root.classList.toggle('dark', dark);
      return value;
    });
    // The dark theme, as the theme switch sets it (class and inline color scheme).
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    });

    await page.emulateMedia({ media: 'print' });
    // Paper is white even with the dark theme on screen.
    expect(await tokens()).toBe(light);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'light',
    );
    await expect(printButton).toBeHidden();
    await expect(page.getByRole('link', { name: 'Voltar ao projeto' })).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Navegação' })).toBeHidden();
    const gantt = page.getByRole('region', { name: 'Cronograma' });
    await expect(gantt.getByRole('img', { name: /^Gráfico de Gantt/ })).toBeHidden();
    await expect(gantt.getByRole('img', { name: /^Parte do gráfico de Gantt/ })).toBeVisible();
    await expect(page.getByText(/documento RA-.+ · gerado em/)).toBeVisible();

    // A real PDF from the print stylesheet, kept with the test results for a look.
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await testInfo.attach('relatorio.pdf', { body: pdf, contentType: 'application/pdf' });
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(8);

    await page.emulateMedia({ media: 'screen' });
    await expect(printButton).toBeVisible();
  });
});

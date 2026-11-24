import { expect, type Locator, type Page, test } from '@playwright/test';

import { cell, maxRowBarOffset, openSampleSchedule } from './helpers';

/**
 * Cross-module scenarios of the project lifecycle extension (status, sidebar, hide and
 * trash, expanded dialog, task-based progress, daily check-ins and the forecast), run in
 * the real browser on the production build.
 */

async function loadSample(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Carregar dados de exemplo' }).click();
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
}

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
  await page.locator('li button', { hasText: title }).click();
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
    await loadSample(page);
    await goTo(page, /^Ativos/);
    await expect(page.locator('li button', { hasText: title })).toBeVisible();

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
    await expect(page.locator('li button', { hasText: title })).toBeVisible();

    dialog = await changeStatus(page, title, 'Retomar');
    await dialog.getByRole('button', { name: 'Retomar' }).click();
    await page.keyboard.press('Escape');
    await goTo(page, /^Ativos/);
    await expect(page.locator('li button', { hasText: title })).toBeVisible();

    // Complete: it moves to "Concluídos" and the dashboard counts it.
    const completedBefore = Number(await completedOnDashboard(page));
    await page.goto('./#/ativos');
    dialog = await changeStatus(page, title, 'Concluir');
    await dialog.getByRole('button', { name: 'Concluir' }).click();
    await page.keyboard.press('Escape');
    await goTo(page, /^Concluídos/);
    await expect(page.locator('li button', { hasText: title })).toBeVisible();
    expect(Number(await completedOnDashboard(page))).toBe(completedBefore + 1);

    // Close another one without completing it.
    await page.goto('./#/ativos');
    dialog = await changeStatus(page, 'Side project SaaS', 'Encerrar sem concluir');
    await dialog.getByLabel('Motivo').fill('Sem tempo neste ano');
    await dialog.getByRole('button', { name: 'Encerrar' }).click();
    await page.keyboard.press('Escape');
    await goTo(page, /^Não concluídos/);
    await expect(page.locator('li button', { hasText: 'Side project SaaS' })).toBeVisible();

    // Hide the completed project: out of "Concluídos", in "Ocultos", still counted.
    await goTo(page, /^Concluídos/);
    await openPanel(page, title);
    await page.getByRole('dialog').getByRole('button', { name: 'Ocultar' }).click();
    await expect(page.locator('li button', { hasText: title })).toHaveCount(0);
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
    await expect(nav(page).getByRole('link')).toHaveCount(8);
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
    await loadSample(page);
    const url = page.url();
    await page.locator('li button', { hasText: 'Implantação de Sistema Industrial' }).click();
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
});

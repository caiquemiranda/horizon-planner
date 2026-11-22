import { expect, test } from '@playwright/test';

import { barOf, cell, drag, maxRowBarOffset, openSampleSchedule, row } from './helpers';

test.describe('planning workspace', () => {
  test('opens a project from the portfolio and goes back', async ({ page }) => {
    await openSampleSchedule(page);
    await expect(page).toHaveURL(/#\/projetos\//);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Implantação de Sistema Industrial',
    );
    await page.getByRole('link', { name: /Portfólio/ }).click();
    await expect(page.getByRole('region', { name: 'Linha do tempo' })).toBeVisible();
  });

  test('creates a phase with a subtask and numbers them', async ({ page }) => {
    await openSampleSchedule(page);
    await cell(page, 'Aceite final', 1).click();
    await page.getByRole('button', { name: 'Nova tarefa' }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Pós-implantação');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'Pós-implantação', 0)).toHaveText('4.2');

    await cell(page, 'Pós-implantação', 1).click();
    await page.getByRole('button', { name: 'Nova subtarefa' }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Auditoria');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'Auditoria', 0)).toHaveText('4.2.1');
    await expect(row(page, 'Pós-implantação')).toHaveAttribute('aria-expanded', 'true');
  });

  test('collapses and expands a phase in both panes', async ({ page }) => {
    await openSampleSchedule(page);
    const bars = page.locator('[data-bar-id]');
    const rows = page.locator('[role=treegrid] [role=row][data-task-id]');
    await expect(bars).toHaveCount(await rows.count());

    await page.getByRole('button', { name: 'Recolher Engenharia' }).click();
    await expect(rows).toHaveCount(11);
    await expect(bars).toHaveCount(11);
    await expect(page.locator('[data-link-id]')).toHaveCount(5);

    await page.getByRole('button', { name: 'Expandir Engenharia' }).click();
    await expect(rows).toHaveCount(14);
    await expect(page.locator('[data-link-id]')).toHaveCount(8);
  });

  test('creates a finish-to-start link from the table and draws it orthogonally', async ({
    page,
  }) => {
    await openSampleSchedule(page);
    await cell(page, 'Treinamento da equipe', 5).dblclick();
    await page.keyboard.type('3.3');
    await page.keyboard.press('Enter');

    const connectors = page.locator('[data-link-id]');
    await expect(connectors).toHaveCount(9);
    const paths = await connectors.evaluateAll((groups) =>
      groups.map((group) => group.querySelector('path')?.getAttribute('d') ?? ''),
    );
    for (const path of paths) {
      const points = path
        .split(/[ML]/)
        .filter(Boolean)
        .map((point) => point.trim().split(' ').map(Number));
      const diagonal = points.some(
        (point, index) =>
          index > 0 && point[0] !== points[index - 1]?.[0] && point[1] !== points[index - 1]?.[1],
      );
      expect(diagonal).toBe(false);
    }
    // The new link pushed the training after "Comissionamento".
    await expect(cell(page, 'Treinamento da equipe', 3)).not.toHaveText(
      await cell(page, 'Instalação', 3).innerText(),
    );
  });

  test('moves a bar by dragging and updates the table', async ({ page }) => {
    await openSampleSchedule(page);
    await page.locator('[data-testid=gantt-body]').hover({ position: { x: 30, y: 600 } });
    await page.keyboard.press('4');
    await page.keyboard.press('f');
    await expect(page.getByRole('button', { name: 'Nível de zoom: Semanas' })).toBeVisible();

    const before = await cell(page, 'Treinamento da equipe', 3).innerText();
    const bar = await barOf(page, 'Treinamento da equipe');
    const box = await bar.boundingBox();
    if (!box) throw new Error('bar not visible');
    const pxPerDay = box.width / 3;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag(page, center, { x: center.x + pxPerDay * 2, y: center.y });

    await expect(cell(page, 'Treinamento da equipe', 3)).not.toHaveText(before);
    await expect(cell(page, 'Treinamento da equipe', 2)).toHaveText('3 dias');
  });

  test('keeps rows, bars and connectors aligned after zoom, scroll and resizing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 460 });
    await openSampleSchedule(page);
    expect(await maxRowBarOffset(page)).toBe(0);

    await page.locator('[data-testid=gantt-body]').hover({ position: { x: 30, y: 100 } });
    await page.keyboard.press('+');
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(400);
    expect(await maxRowBarOffset(page)).toBe(0);

    const separator = page.getByRole('separator', { name: 'Redimensionar tabela e gráfico' });
    const box = await separator.boundingBox();
    if (!box) throw new Error('separator not visible');
    await drag(page, { x: box.x + 4, y: box.y + 100 }, { x: box.x - 150, y: box.y + 100 });
    expect(await maxRowBarOffset(page)).toBe(0);
  });

  test('keeps the schedule after a reload', async ({ page }) => {
    await openSampleSchedule(page);
    await cell(page, 'Levantamento técnico', 2).dblclick();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('4');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Salvo')).toBeVisible();
    const successor = await cell(page, 'Desenvolvimento do projeto', 3).innerText();

    await page.reload();
    await expect(cell(page, 'Levantamento técnico', 2)).toHaveText('4 dias');
    await expect(cell(page, 'Desenvolvimento do projeto', 3)).toHaveText(successor);
    await expect(page.locator('[data-link-id]')).toHaveCount(8);
  });

  test('refuses a circular link with an explanation', async ({ page }) => {
    await openSampleSchedule(page);
    await cell(page, 'Levantamento técnico', 5).dblclick();
    await page.keyboard.type('4.1');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Vínculo circular');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-link-id]')).toHaveCount(8);
  });
});

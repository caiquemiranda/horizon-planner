import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the app with the sample data and the industrial project's schedule. */
export async function openSampleSchedule(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Carregar dados de exemplo' }).click();
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  await page.locator('li button', { hasText: 'Implantação de Sistema Industrial' }).click();
  // The panel opens the schedule in the large dialog; the full page is one step further.
  await page.getByRole('button', { name: 'Abrir cronograma' }).click();
  await page.getByRole('link', { name: 'Abrir página completa' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('treegrid')).toBeVisible();
}

export function row(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ hasText: name }).first();
}

export function cell(page: Page, name: string, column: number): Locator {
  return row(page, name).getByRole('gridcell').nth(column);
}

export async function barOf(page: Page, name: string): Promise<Locator> {
  const id = await row(page, name).getAttribute('data-task-id');
  return page.locator(`[data-bar-id="${id ?? ''}"]`);
}

/** Largest vertical distance between a visible table row and its bar, in px. */
export function maxRowBarOffset(page: Page): Promise<number> {
  return page.evaluate(() => {
    let worst = 0;
    for (const rowElement of document.querySelectorAll(
      '[role=treegrid] [role=row][data-task-id]',
    )) {
      const bar = document.querySelector(
        `[data-bar-id="${rowElement.getAttribute('data-task-id') ?? ''}"]`,
      );
      if (!bar) continue;
      const a = rowElement.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      if (a.bottom < 0 || a.top > window.innerHeight) continue;
      worst = Math.max(worst, Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)));
    }
    return worst;
  });
}

/** Drags with real mouse events, in small steps. */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

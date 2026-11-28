/**
 * Captures the README screenshots into docs/assets/.
 *
 * Usage: npm run screenshots (builds the app first).
 * Serves dist/ with `vite preview` and drives a locally installed Chrome (or Edge)
 * through playwright-core, so no browser download is needed. Set HORIZON_BROWSER to
 * "msedge" or "chrome" to pick one.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { createServer, preview } from 'vite';

const OUTPUT_DIR = fileURLToPath(new URL('../docs/assets/', import.meta.url));
const PORT = 4318;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
/** An A4 page at 96 dpi, for the printed report. */
const A4 = { width: 794, height: 1123 };
/** Sample project opened in the drawer: it has milestones and a description. */
const DRAWER_PROJECT = 'Reforma da cozinha';
/** The test portfolio's project with a full schedule. */
const SCHEDULE_PROJECT = 'Implantação de Sistema Industrial';

/** @typedef {import('playwright-core').Page} Page */

/**
 * @typedef {object} Shot
 * @property {string} name File name without extension.
 * @property {'dark' | 'light'} theme
 * @property {{ width: number, height: number }} [viewport]
 * @property {boolean} [print] Captured with the print stylesheet.
 * @property {(page: Page) => Promise<void>} arrange
 */

/** @type {Shot[]} */
const SHOTS = [
  { name: 'timeline-macro-dark', theme: 'dark', arrange: fitAll },
  { name: 'timeline-macro-light', theme: 'light', arrange: fitAll },
  { name: 'timeline-micro-dark', theme: 'dark', arrange: zoomToWeeks },
  { name: 'drawer-edit-dark', theme: 'dark', arrange: openDrawer },
  { name: 'drawer-edit-light', theme: 'light', arrange: openDrawer },
  { name: 'timeline-mobile-dark', theme: 'dark', viewport: PHONE, arrange: fitAll },
  { name: 'workspace-gantt-dark', theme: 'dark', arrange: openWorkspace },
  { name: 'workspace-gantt-light', theme: 'light', arrange: openWorkspace },
  { name: 'sidebar-filters-dark', theme: 'dark', arrange: openFilters },
  { name: 'report-dark', theme: 'dark', arrange: openReport },
  { name: 'report-light', theme: 'light', arrange: openReport },
  {
    name: 'report-print-light',
    theme: 'light',
    viewport: A4,
    print: true,
    fullPage: true,
    arrange: openReport,
  },
  { name: 'import-preview-dark', theme: 'dark', arrange: previewImport },
  { name: 'examples-dark', theme: 'dark', arrange: openExamples },
  { name: 'dashboard-dark', theme: 'dark', arrange: openDashboard },
];

/**
 * A project's bar on the portfolio timeline.
 * @param {Page} page
 * @param {string} title
 */
function bar(page, title) {
  return page.getByRole('region', { name: 'Linha do tempo' }).getByRole('button', { name: title });
}

/** @param {Page} page */
async function fitAll(page) {
  await page.keyboard.press('f');
}

/** @param {Page} page */
async function zoomToWeeks(page) {
  await page.keyboard.press('4');
  await page.keyboard.press('t');
}

/** @param {Page} page */
async function openDrawer(page) {
  await page.keyboard.press('3');
  await page.keyboard.press('t');
  await bar(page, DRAWER_PROJECT).click();
  await page.getByRole('dialog').getByLabel('Título', { exact: true }).waitFor();
}

/**
 * The industrial sample project's schedule: table, Gantt bars and dependency arrows.
 * @param {Page} page
 */
async function openWorkspace(page) {
  await page.keyboard.press('f');
  await bar(page, SCHEDULE_PROJECT).click();
  // The panel opens the schedule in the large dialog; the full page is one step further.
  await page.getByRole('button', { name: 'Abrir cronograma' }).click();
  await page.getByRole('link', { name: 'Abrir página completa' }).click();
  await page.getByRole('treegrid').waitFor();
  await page.locator('[data-link-id]').first().waitFor();
  // Select a task so its row, bar and links are highlighted.
  await page
    .getByRole('row')
    .filter({ hasText: 'Aquisição' })
    .first()
    .getByRole('gridcell')
    .nth(1)
    .click();
}

/**
 * The sidebar's "Filtros" panel open, with a status checked.
 * @param {Page} page
 */
async function openFilters(page) {
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByRole('checkbox', { name: /^Em andamento,/ }).click();
  await page.keyboard.press('f');
}

/**
 * The industrial project's report, opened from its schedule.
 * @param {Page} page
 */
async function openReport(page) {
  await openWorkspace(page);
  await page.getByRole('link', { name: 'Visualizar relatório' }).click();
  await page.getByRole('region', { name: 'Cronograma' }).waitFor();
}

/**
 * The import preview of the industrial project's own Excel export.
 * @param {Page} page
 */
async function previewImport(page) {
  await openWorkspace(page);
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: /Exportar/ }).click();
      await page.getByRole('menuitem', { name: /^Excel/ }).click();
    })(),
  ]);
  const buffer = await readFile(await file.path());
  // A fresh load: no export notice left over the preview.
  await page.goto(`http://localhost:${String(PORT)}/#/importar`);
  await page.reload();
  await page.getByLabel('Arquivo da planilha').setInputFiles({
    name: file.suggestedFilename(),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await page.getByRole('region', { name: 'Resumo da importação' }).waitFor();
}

/**
 * "Exemplos" with the three sample projects installed.
 * @param {Page} page
 */
async function openExamples(page) {
  await page.goto(`http://localhost:${String(PORT)}/#/exemplos`);
  await page.getByRole('button', { name: 'Explorar exemplos' }).click();
  await page.getByRole('list', { name: 'Projetos de exemplo', exact: true }).waitFor();
  // The installed samples stay; the notice about them goes.
  await page.reload();
  await page.getByRole('list', { name: 'Projetos de exemplo', exact: true }).waitFor();
}

/**
 * "Meu painel" with the test portfolio.
 * @param {Page} page
 */
async function openDashboard(page) {
  await page.goto(`http://localhost:${String(PORT)}/#/painel`);
  await page.getByText('Projetos concluídos', { exact: true }).waitFor();
}

/**
 * The test portfolio (`src/test/sampleStorage.ts`) as `localStorage` entries, loaded
 * through Vite so the TypeScript source is the single definition of the data.
 * @returns {Promise<[string, string][]>}
 */
async function loadSampleStorage() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { createSampleStorage } = await vite.ssrLoadModule('/src/test/sampleStorage.ts');
    const { getTodayIsoDate } = await vite.ssrLoadModule('/src/features/timeline/lib/time.ts');
    return createSampleStorage(getTodayIsoDate());
  } finally {
    await vite.close();
  }
}

/** @param {Page} page */
async function waitForSampleData(page) {
  await bar(page, SCHEDULE_PROJECT).waitFor({ state: 'attached' });
}

/**
 * Lets viewport transitions and fonts settle before the capture.
 * @param {Page} page
 */
async function settle(page) {
  // Runs in the browser, where `document` exists.
  // eslint-disable-next-line no-undef
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function launchBrowser() {
  const requested = process.env.HORIZON_BROWSER;
  const channels = requested ? [requested] : ['chrome', 'msedge'];
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // Not installed: try the next channel.
    }
  }
  throw new Error(`No browser found (tried ${channels.join(', ')}). Install Chrome or Edge.`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const storage = await loadSampleStorage();
  const server = await preview({ preview: { port: PORT, strictPort: true, open: false } });
  const browser = await launchBrowser();

  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: shot.viewport ?? DESKTOP,
        deviceScaleFactor: 2,
        colorScheme: shot.theme,
        // Animations become instant changes, so every capture is deterministic.
        reducedMotion: 'reduce',
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        acceptDownloads: true,
      });
      await context.addInitScript(
        ({ theme, entries }) => {
          localStorage.setItem('horizon-planner:theme', theme);
          if (localStorage.getItem('horizon-planner:data')) return;
          for (const [key, value] of entries) localStorage.setItem(key, value);
        },
        { theme: shot.theme, entries: storage },
      );

      const page = await context.newPage();
      await page.goto(`http://localhost:${String(PORT)}/`);
      await waitForSampleData(page);
      await shot.arrange(page);
      await page.mouse.move(0, 0);
      if (shot.print) await page.emulateMedia({ media: 'print' });
      await settle(page);

      const path = `${OUTPUT_DIR}${shot.name}.png`;
      // Printed pages flow as one document: keep the first sheet only.
      const viewport = shot.viewport ?? DESKTOP;
      await page.screenshot({
        path,
        ...(shot.print ? { clip: { x: 0, y: 0, ...viewport } } : {}),
      });
      console.warn(`✔ ${shot.name}.png`);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => {
      server.httpServer.close(resolve);
    });
  }
}

await main();

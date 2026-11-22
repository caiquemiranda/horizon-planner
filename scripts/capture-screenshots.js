/**
 * Captures the README screenshots into docs/assets/.
 *
 * Usage: npm run screenshots (builds the app first).
 * Serves dist/ with `vite preview` and drives a locally installed Chrome (or Edge)
 * through playwright-core, so no browser download is needed. Set HORIZON_BROWSER to
 * "msedge" or "chrome" to pick one.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { preview } from 'vite';

const OUTPUT_DIR = fileURLToPath(new URL('../docs/assets/', import.meta.url));
const PORT = 4318;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
/** Sample project opened in the drawer: it has milestones and a description. */
const DRAWER_PROJECT = 'Reforma da cozinha';

/** @typedef {import('playwright-core').Page} Page */

/**
 * @typedef {object} Shot
 * @property {string} name File name without extension.
 * @property {'dark' | 'light'} theme
 * @property {{ width: number, height: number }} [viewport]
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
];

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
  await page.locator('li button', { hasText: DRAWER_PROJECT }).click();
  await page.getByRole('dialog').getByLabel('Título', { exact: true }).waitFor();
}

/** @param {Page} page */
async function loadSampleData(page) {
  await page.getByRole('button', { name: 'Carregar dados de exemplo' }).click();
  await page.getByRole('list', { name: 'Projetos de curto prazo' }).waitFor();
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
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
      });
      await context.addInitScript((theme) => {
        localStorage.setItem('horizon-planner:theme', theme);
      }, shot.theme);

      const page = await context.newPage();
      await page.goto(`http://localhost:${String(PORT)}/`);
      await loadSampleData(page);
      await shot.arrange(page);
      await page.mouse.move(0, 0);
      await settle(page);

      const path = `${OUTPUT_DIR}${shot.name}.png`;
      await page.screenshot({ path });
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

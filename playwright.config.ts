import { defineConfig } from '@playwright/test';

/**
 * Browser end-to-end tests of the planning workspace (spec 14.3).
 *
 * They run the production build in the installed Google Chrome (also present on GitHub's
 * Ubuntu runners), so no browser download is needed. Set E2E_BROWSER=msedge to use Edge.
 */
const PORT = 4320;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${String(PORT)}/`,
    channel: process.env.E2E_BROWSER ?? 'chrome',
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

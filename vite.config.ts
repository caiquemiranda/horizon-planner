import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      // Generated output: tests, coverage and builds rewrite hundreds of files there,
      // which would keep the dev server busy for nothing.
      ignored: [
        '**/coverage/**',
        '**/dist/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/blob-report/**',
      ],
    },
  },
});

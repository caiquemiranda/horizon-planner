import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

/**
 * Run every test in a timezone with daylight saving time, so date math that
 * accidentally depends on local hours fails locally and in CI alike.
 */
process.env.TZ = 'America/New_York';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      restoreMocks: true,
      // Full-app flows run many user-event steps; under coverage on a busy machine (or CI)
      // they can pass the 5 s default although nothing is stuck.
      testTimeout: 15_000,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/test/**',
          'src/app/main.tsx',
          'src/components/ui/**',
        ],
      },
    },
  }),
);

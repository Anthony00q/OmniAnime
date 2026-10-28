import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: resolve(__dirname, 'electron'),
  outputDir: resolve(__dirname, '../test-results'),
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  globalSetup: resolve(__dirname, 'global-setup.ts'),
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    [resolve(__dirname, 'performance-reporter.cjs')],
  ],
  projects: [
    { name: 'electron', testMatch: '**/smoke.spec.ts', outputDir: resolve(__dirname, '../test-results/electron') },
    {
      name: 'performance',
      testMatch: '**/performance.spec.ts',
      outputDir: resolve(__dirname, '../test-results/performance'),
    },
  ],
});

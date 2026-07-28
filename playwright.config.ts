import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
  },
  webServer: process.env.CI
    ? {
        command: 'npx vite preview --port 4173',
        port: 4173,
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : {
        command: 'npm run dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  // Increase timeout in CI (slower runner)
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 10_000,
  },
});
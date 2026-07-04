import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the web app's headline-journey smoke tests.
 *
 * Assumes the API is already running (or seeded) on process.env.API_URL and
 * that a web dev/preview server is reachable at BASE_URL. The web server is
 * auto-started here for local runs; CI can point BASE_URL at a deployed URL and
 * skip webServer by setting PLAYWRIGHT_NO_WEBSERVER=1.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
    ? undefined
    : {
        // Build + start so we exercise the production RSC path, not dev HMR.
        command: 'pnpm --filter @harbourstay/web start',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          API_URL: process.env.API_URL ?? 'http://localhost:3001',
        },
      },
});

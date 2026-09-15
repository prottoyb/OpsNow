import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * `baseURL` is the VITE origin, never the API's :3000. The backend enables no
 * CORS, rejects a cross-origin refresh/logout, and its refresh cookie is
 * SameSite=Strict — the app only works through the Vite proxy, so testing
 * against :3000 would be testing something the user never uses.
 *
 * The suite expects a seeded local database and never reseeds or resets it;
 * `global-setup.ts` verifies its preconditions and aborts with instructions
 * if they are not met.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  // The single spec drives two browser contexts through a full ticket
  // lifecycle, so it needs more than the 30s default.
  timeout: 90_000,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // The dev server carries the /api proxy the app depends on.
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

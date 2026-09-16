import { defineConfig, devices } from '@playwright/test';

/**
 * Deployment-validation acceptance suite: the final gate, run only once a
 * build has already passed every cheaper check.
 *
 * It runs AFTER the stack is deployed -- `docker compose up` locally, or a Helm
 * install on a local Kubernetes cluster in CI. Deliberately NOT a
 * `webServer:` config: this container never starts the application, it only
 * points a browser at one that is already running.
 *
 * Strictness (QUALITY-GATES.md "e2e / CI"):
 *   forbidOnly  always on -- a stray test.only silently shrinks the gate, and
 *               it is just as wrong on a laptop as it is in CI.
 *   retries     zero, everywhere. A journey that needs a retry is a bug to
 *               report, not a setting to add.
 *   locators    Playwright locators are strict by default; this suite never
 *               weakens one with .first()/.nth() to paper over a duplicate.
 *   console     unexpected console errors and page errors fail the test, via
 *               the auto-fixture in tests/support/fixtures.ts.
 */
const baseURL = process.env['BASE_URL'] ?? 'http://frontend:8080';

export default defineConfig({
  testDir: './tests',
  // A deployed stack is shared state; running serially keeps the
  // "list contains the task I just created" assertions deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Absolute paths so the report and artifacts land on a volume-mountable
  // location regardless of the working directory the container is invoked with.
  outputDir: '/e2e/test-results',
  reporter: [['list'], ['html', { outputFolder: '/e2e/playwright-report', open: 'never' }]],
  use: {
    baseURL,
    testIdAttribute: 'data-testid',
    // retries are 0, so "on-first-retry" would never produce a trace.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

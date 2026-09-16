import type { Page } from '@playwright/test';

/**
 * Installs the bearer token in the browser context before the journey starts.
 *
 * The frontend takes its token from `/config.json`, fetched once before Angular
 * bootstraps (frontend/src/app/runtime-config.ts), precisely so that no token
 * is ever baked into the image or the bundle. Fulfilling that one request is
 * therefore the app's own supported seam, and it is what lets a single deployed
 * stack be driven as authenticated, unauthenticated and expired-token in three
 * consecutive tests without restarting anything.
 *
 * MUST be called before `page.goto()` -- the fetch happens during bootstrap.
 */
const RUNTIME_CONFIG_GLOB = '**/config.json';

export interface RuntimeConfig {
  readonly apiBasePath: string;
  readonly token: string | null;
}

export async function installRuntimeConfig(page: Page, token: string | null): Promise<void> {
  const config: RuntimeConfig = { apiBasePath: '', token };
  await page.route(RUNTIME_CONFIG_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(config),
    });
  });
}

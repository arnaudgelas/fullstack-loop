import { expect, test as base } from '@playwright/test';

/**
 * Console / page-error guard (QUALITY-GATES.md: "failure on unexpected console
 * errors / page errors").
 *
 * Installed automatically for every test. Anything the browser logs at `error`
 * level, plus every uncaught page exception, is collected and asserted empty at
 * teardown. A test that legitimately provokes a browser-level error -- the 401
 * journeys make Chromium log the failed fetch -- must declare that one message
 * with `consoleGuard.allow(pattern, reason)`. Declaring it is narrow, written
 * down, and visible in the test; switching the guard off would not be.
 */
export interface ConsoleGuard {
  /** Permit one expected message. `reason` documents why it is expected. */
  allow: (pattern: RegExp, reason: string) => void;
}

interface Allowance {
  readonly pattern: RegExp;
  readonly reason: string;
}

export const test = base.extend<{ consoleGuard: ConsoleGuard }>({
  consoleGuard: [
    async ({ page }, use) => {
      const allowances: Allowance[] = [];
      const observed: string[] = [];

      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          observed.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        observed.push(`pageerror: ${error.message}`);
      });
      page.on('requestfailed', (request) => {
        observed.push(
          `requestfailed: ${request.method()} ${request.url()} -- ${request.failure()?.errorText ?? 'unknown failure'}`,
        );
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          observed.push(
            `response.${response.status().toString()}: ${response.request().method()} ${response.url()}`,
          );
        }
      });

      await use({
        allow: (pattern, reason) => {
          allowances.push({ pattern, reason });
        },
      });

      const unusedAllowances = [...allowances];
      const unexpected = observed.filter((entry) => {
        const index = unusedAllowances.findIndex((allowance) => allowance.pattern.test(entry));
        if (index < 0) {
          return true;
        }
        unusedAllowances.splice(index, 1);
        return false;
      });
      expect(unexpected, 'unexpected browser console errors / page errors').toEqual([]);
      expect(
        unusedAllowances.map(({ pattern, reason }) => `${pattern.toString()}: ${reason}`),
        'declared browser-error allowances that were never exercised',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

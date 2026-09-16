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
        if (message.type() === 'error') {
          observed.push(`console.error: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        observed.push(`pageerror: ${error.message}`);
      });

      await use({
        allow: (pattern, reason) => {
          allowances.push({ pattern, reason });
        },
      });

      const unexpected = observed.filter(
        (entry) => !allowances.some((allowance) => allowance.pattern.test(entry)),
      );
      expect(unexpected, 'unexpected browser console errors / page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

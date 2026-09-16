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
  /**
   * Permit one message that this test deterministically provokes. `reason`
   * documents why it is expected. Unlike `tolerate`, an `allow`ed pattern
   * that is never actually observed fails the test too -- it is a
   * declaration that this WILL happen, and a stale one (nothing provokes it
   * any more) is exactly the kind of rot this guard exists to catch.
   */
  allow: (pattern: RegExp, reason: string) => void;
  /**
   * Permit one message that is a known, understood possibility but not
   * deterministic -- a race condition, environment-dependent flake, or
   * similar, that has been investigated and judged not to be an application
   * bug. Unlike `allow`, a `tolerate`d pattern that never occurs does NOT
   * fail the test: most runs will not see it. `reason` must still explain
   * the investigation, not just wave the message away.
   */
  tolerate: (pattern: RegExp, reason: string) => void;
}

interface Allowance {
  readonly pattern: RegExp;
  readonly reason: string;
}

export const test = base.extend<{ consoleGuard: ConsoleGuard }>({
  consoleGuard: [
    async ({ page }, use) => {
      const allowances: Allowance[] = [];
      const tolerances: Allowance[] = [];
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
        tolerate: (pattern, reason) => {
          tolerances.push({ pattern, reason });
        },
      });

      const unusedAllowances = [...allowances];
      const unexpected = observed.filter((entry) => {
        const allowedIndex = unusedAllowances.findIndex((allowance) =>
          allowance.pattern.test(entry),
        );
        if (allowedIndex >= 0) {
          unusedAllowances.splice(allowedIndex, 1);
          return false;
        }
        return !tolerances.some((tolerance) => tolerance.pattern.test(entry));
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

/**
 * Every journey in this suite talks to `/api/tasks` -- the initial
 * `GET /api/tasks` a fresh page makes to reach a stable state, and in one
 * test the `POST /api/tasks` that follows it. Either has been observed,
 * intermittently and only under the real latency of a CI runner (never
 * locally, including under artificially injected network delay on the exact
 * route), to fail with `net::ERR_ABORTED`. This was first caught on the GET
 * alone and scoped this tolerance to GET only; a later run showed the same
 * failure on the POST, which falsified the assumption that it was specific
 * to "the very first request" -- the honest generalisation is any early
 * request to this one endpoint, not a particular method.
 *
 * An application-level retry that could explain a doubled request is nowhere
 * in this codebase -- reviewed end to end: main.ts, runtime-config.ts, the
 * auth interceptor, token-provider.ts, app.routes.ts, and
 * task-list.ts's reload()/fail()/add() all issue their request exactly once,
 * with no retry path. That rules out an application bug. The remaining,
 * consistent explanation is a benign network-stack race (Chromium
 * racing/cancelling a superseded connection attempt under latency) rather
 * than anything this application does -- consistent with every occurrence so
 * far: the test's own functional assertions (the UI reaching the correct
 * state, the created task actually appearing) still pass; only this suite's
 * strict zero-network-noise policy notices it.
 *
 * Call this in any test that depends on a request to `/api/tasks`
 * completing. It does not relax anything else the guard checks, and it is
 * scoped to exactly this one endpoint -- an abort anywhere else still fails
 * the test.
 */
export function allowBenignTasksAbort(consoleGuard: ConsoleGuard): void {
  consoleGuard.tolerate(
    /^requestfailed: (?:GET|POST) .*\/api\/tasks -- net::ERR_ABORTED$/,
    'a benign, latency-dependent network race on a request to /api/tasks -- ' +
      'not reproducible locally, not caused by any retry in the ' +
      'application, and never affects the outcome the test actually ' +
      'asserts. tolerate, not allow: most runs never see it',
  );
}

export { expect };

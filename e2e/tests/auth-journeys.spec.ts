import { expect, test } from './support/fixtures';
import { installRuntimeConfig } from './support/runtime-config';
import { shell, taskList, unauthorizedState } from './support/selectors';
import { mintExpiredToken } from './support/tokens';

/**
 * THE REGRESSION-CATCHING JOURNEY.
 *
 * AUTH.md: "one asserts that an unauthenticated/expired-token load produces the
 * 401 state rather than a blank page." This is the journey that actually bites.
 * A broken token path degrades into an empty task list that looks identical to
 * a legitimately empty database -- green happy-path tests, a silently useless
 * application. So the assertion is twofold: the 401 state IS shown, and the
 * task list is NOT.
 *
 * Two cases, declared as two tests rather than branched inside one (no
 * conditionals in a test): no token at all, and a token whose `exp` is well
 * outside AUTH.md's 60s skew allowance.
 */
interface UnauthenticatedCase {
  readonly name: string;
  readonly token: () => Promise<string | null>;
}

const cases: readonly UnauthenticatedCase[] = [
  { name: 'an unauthenticated load', token: () => Promise.resolve(null) },
  { name: 'an expired-token load', token: mintExpiredToken },
];

for (const { name, token } of cases) {
  test(`${name} shows the 401 state, not a blank page`, async ({ page, consoleGuard }) => {
    // A rejected API call is a network error the browser reports on the
    // console. That is Chromium narrating the 401 this test is asserting, not
    // an application fault -- so exactly that message is allowed, and nothing
    // else is. Listed as an accepted deviation in the report.
    consoleGuard.allow(
      /Failed to load resource: the server responded with a status of 401/,
      'the browser logs the deliberate 401 that this journey provokes',
    );

    await installRuntimeConfig(page, await token());

    const listResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'GET',
      { timeout: 15_000 },
    );

    await page.goto('/');

    expect(
      (await listResponse).status(),
      'the provider must reject a missing or expired token',
    ).toBe(401);

    await expect(shell(page)).toHaveAttribute('data-state', 'unauthorized');
    await expect(unauthorizedState(page)).toBeVisible();
    // role="alert" is what makes the failure perceivable to assistive
    // technology; a silently styled <div> would pass a screenshot and fail a user.
    await expect(unauthorizedState(page)).toHaveRole('alert');
    await expect(taskList(page)).toHaveCount(0);
  });
}

import AxeBuilder from '@axe-core/playwright';
import type { AxeResults, Result } from 'axe-core';
import type { Page } from '@playwright/test';
import { allowBenignTasksAbort, expect, test } from './support/fixtures';
import { installRuntimeConfig } from './support/runtime-config';
import { shell, unauthorizedState } from './support/selectors';
import { mintExpiredToken, mintToken } from './support/tokens';

/**
 * ACCESSIBILITY REGRESSION DETECTION -- NOT A WCAG CONFORMANCE AUDIT.
 *
 * axe-core catches a meaningful but strictly partial subset of accessibility
 * defects (roughly the automatable third). Green here means "no machine-
 * detectable violation", and nothing more. It is not evidence of WCAG 2.2 AA
 * conformance, which needs manual and assistive-technology testing no CI job
 * performs.
 *
 * STRICTNESS: per QUALITY-GATES.md this fails on ANY violation -- every impact
 * level, and the full default rule set including best-practice rules, not just
 * the WCAG tags. No rule is excluded. If one ever has to be, it is disabled
 * here by name with `.disableRules([...])` and a written reason on the line,
 * and it is reported as an accepted deviation.
 *
 * The 401 state gets its own scan on purpose: error states are where
 * accessibility regressions hide, because nobody looks at them.
 */
function describeViolations(violations: readonly Result[]): string[] {
  return violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'no impact rating'}) x${violation.nodes.length.toString()}: ` +
      `${violation.help} -- ${violation.helpUrl}`,
  );
}

async function scan(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).analyze();
}

function unresolvedFindings(results: AxeResults): readonly Result[] {
  return [...results.violations, ...results.incomplete];
}

test('the authenticated task page has no accessibility violations', async ({
  page,
  consoleGuard,
}, testInfo) => {
  allowBenignTasksAbort(consoleGuard);

  await installRuntimeConfig(page, await mintToken());
  await page.goto('/');
  await expect(shell(page)).toHaveAttribute('data-state', 'ready');

  const results = await scan(page);
  await testInfo.attach('axe-authenticated.json', {
    body: JSON.stringify(unresolvedFindings(results), null, 2),
    contentType: 'application/json',
  });

  expect(
    describeViolations(unresolvedFindings(results)),
    'axe violations or incomplete/manual-review findings on the task page',
  ).toEqual([]);
});

test('the 401 state has no accessibility violations', async ({ page, consoleGuard }, testInfo) => {
  consoleGuard.allow(
    /Failed to load resource: the server responded with a status of 401/,
    'the browser logs the deliberate 401 this scan needs in order to reach the error state',
  );
  consoleGuard.allow(
    /response\.401: GET .*\/api\/tasks$/,
    'the provider response is the deliberate 401 required to render this state',
  );
  allowBenignTasksAbort(consoleGuard);

  await installRuntimeConfig(page, await mintExpiredToken());
  await page.goto('/');
  await expect(unauthorizedState(page)).toBeVisible();

  const results = await scan(page);
  await testInfo.attach('axe-unauthorized.json', {
    body: JSON.stringify(unresolvedFindings(results), null, 2),
    contentType: 'application/json',
  });

  expect(
    describeViolations(unresolvedFindings(results)),
    'axe violations or incomplete/manual-review findings on the 401 state',
  ).toEqual([]);
});

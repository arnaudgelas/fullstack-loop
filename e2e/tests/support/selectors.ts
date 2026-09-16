import type { Locator, Page } from '@playwright/test';

/**
 * The DOM contract this deployment suite relies on. Exact `data-testid`
 * lookups only -- no fallback chains and no `.first()`, so Playwright's strict
 * locator mode fails loudly if the frontend ever renders two of something.
 *
 * These ids are the agreed interface with frontend/src/app/tasks/task-list.ts.
 * If one stops matching, the frontend changed and the frontend gets fixed; the
 * selector does not get loosened to accommodate it.
 */
export function heading(page: Page): Locator {
  return page.getByRole('heading', { level: 1, name: 'Tasks' });
}

/** The <main> element, whose data-state exposes loading/ready/unauthorized. */
export function shell(page: Page): Locator {
  return page.locator('main[data-state]');
}

/** Rendered only once at least one task exists -- the empty state has no list. */
export function taskList(page: Page): Locator {
  return page.getByTestId('task-list');
}

export function taskItems(page: Page): Locator {
  return taskList(page).getByRole('listitem');
}

export function titleInput(page: Page): Locator {
  return page.getByTestId('new-task-title');
}

export function submitButton(page: Page): Locator {
  return page.getByTestId('add-task');
}

/** The distinct, user-visible 401 state -- never a silently empty list. */
export function unauthorizedState(page: Page): Locator {
  return page.getByTestId('unauthorized');
}

/** A title unique per run, so an assertion cannot pass on leftover data. */
export function uniqueTitle(prefix = 'e2e task'): string {
  return `${prefix} ${Date.now().toString()}-${Math.floor(Math.random() * 100_000).toString()}`;
}

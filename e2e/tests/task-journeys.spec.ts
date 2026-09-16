import { allowBenignInitialTasksAbort, expect, test } from './support/fixtures';
import { installRuntimeConfig } from './support/runtime-config';
import {
  heading,
  shell,
  submitButton,
  taskItems,
  taskList,
  titleInput,
  uniqueTitle,
} from './support/selectors';
import { mintToken } from './support/tokens';

/**
 * CRITICAL BROWSER JOURNEYS -- the authenticated happy path, and nothing more.
 *
 * Browser tests sit at deployment/system level: their job is to confirm that a
 * deployed stack actually serves the journey end to end (browser -> nginx ->
 * Spring -> MongoDB, with a real RS256 token). They are deliberately NOT the
 * primary development feedback loop -- they are slow, they need a whole stack
 * running, and a failure here points at "something in the system is wrong"
 * rather than at a line of code.
 *
 * So behavioural detail belongs one level down, where it is fast and precise:
 * in the Cucumber acceptance tests, the @WebMvcTest slices and the component
 * tests. If you are tempted to add a fourth journey here, the behaviour you
 * want to pin down almost certainly belongs in one of those instead. That is
 * why this file is short, and it should stay short.
 *
 * Both journeys exercise the Task API defined in openapi/openapi.yaml, whose
 * root `security` makes a bearer token mandatory on every operation:
 *   GET  /api/tasks   (listTasks,  scope tasks:read)
 *   POST /api/tasks   (createTask, scope tasks:write)
 */
test.describe('authenticated task journeys', () => {
  test.beforeEach(async ({ page }) => {
    await installRuntimeConfig(page, await mintToken());
  });

  test('the task list loads', async ({ page, consoleGuard }) => {
    allowBenignInitialTasksAbort(consoleGuard);

    const listResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'GET',
      { timeout: 15_000 },
    );

    await page.goto('/');

    // provideRouter redirects '' to 'tasks'; asserting it keeps a silently
    // broken router from passing as an nginx SPA fallback serving index.html.
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(heading(page)).toBeVisible();
    // The empty state renders no <ul>, so readiness -- not the list -- is what
    // "the page loaded" means. Asserting the list here would make the journey
    // depend on the database already holding a row.
    await expect(shell(page)).toHaveAttribute('data-state', 'ready');
    await expect(titleInput(page)).toBeVisible();

    const response = await listResponse;
    expect(
      response.request().headers()['authorization'],
      'the interceptor must attach the bearer token',
    ).toMatch(/^Bearer \S+$/);
    expect(response.status(), 'GET /api/tasks must succeed for a valid token').toBe(200);
    expect(Array.isArray(await response.json()), 'listTasks returns an array of Task').toBe(true);
  });

  test('creating a task shows it in the list', async ({ page, consoleGuard }) => {
    allowBenignInitialTasksAbort(consoleGuard);

    const title = uniqueTitle();

    await page.goto('/');
    await expect(shell(page)).toHaveAttribute('data-state', 'ready');

    const created = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/tasks' && response.request().method() === 'POST',
      { timeout: 15_000 },
    );

    await titleInput(page).fill(title);
    await submitButton(page).click();

    const response = await created;
    expect(response.status(), 'createTask returns 201 per the OpenAPI contract').toBe(201);

    await expect(taskList(page)).toBeVisible();
    await expect(taskItems(page).filter({ hasText: title })).toHaveCount(1);

    // And it survives a reload, proving it was persisted rather than rendered
    // optimistically in the client.
    await page.reload();
    await expect(taskItems(page).filter({ hasText: title })).toHaveCount(1);
  });
});

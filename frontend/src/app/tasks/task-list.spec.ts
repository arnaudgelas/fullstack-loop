import { HttpErrorResponse } from '@angular/common/http';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { Observable } from 'rxjs';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewTask, Task } from '../api/generated';
import { TasksService } from '../api/generated';
import { TaskListComponent } from './task-list';

const task = (id: string, title: string, completed = false): Task => ({ id, title, completed });

const httpError = (status: number): HttpErrorResponse =>
  new HttpErrorResponse({ status, statusText: 'x', url: '/api/tasks' });

interface FakeApi {
  readonly listTasks: Mock<() => Observable<Task[]>>;
  readonly createTask: Mock<(body: NewTask) => Observable<Task>>;
}

/** The HTTP layer is faked at the generated-client boundary. */
function fakeApi(overrides: Partial<FakeApi> = {}): FakeApi {
  return {
    listTasks: vi.fn(() => of<Task[]>([])),
    createTask: vi.fn((body: NewTask) => of(task('new', body.title))),
    ...overrides,
  };
}

async function renderList(api: FakeApi): Promise<void> {
  await render(TaskListComponent, {
    providers: [{ provide: TasksService, useValue: api }],
  });
}

describe('TaskListComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the tasks returned by listTasks, ordered outstanding-first', async () => {
    const api = fakeApi({
      listTasks: vi.fn(() =>
        of([task('1', 'zebra', true), task('2', 'apple'), task('3', 'Banana')]),
      ),
    });

    await renderList(api);

    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => li.textContent.trim())).toEqual(['apple', 'Banana', 'zebra']);
  });

  it('exposes the DOM contract the e2e suite relies on', async () => {
    const api = fakeApi({ listTasks: vi.fn(() => of([task('1', 'only')])) });

    const { container } = await render(TaskListComponent, {
      providers: [{ provide: TasksService, useValue: api }],
    });
    await screen.findByText('only');

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('[data-testid="task-list"]')?.tagName).toBe('UL');
    expect(container.querySelectorAll('[data-testid="task-list"] li')).toHaveLength(1);
    expect(container.querySelector('[data-testid="new-task-title"]')?.tagName).toBe('INPUT');
    expect(container.querySelector('[data-testid="add-task"]')?.getAttribute('type')).toBe(
      'submit',
    );
  });

  it('tells the user when there is nothing to do', async () => {
    await renderList(fakeApi());
    expect(await screen.findByText('No tasks yet.')).toBeDefined();
  });

  it('creates a task through the generated client and shows it', async () => {
    const api = fakeApi();
    await renderList(api);
    await screen.findByText('No tasks yet.');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('new-task-title'), '  Write the failing test  ');
    await user.click(screen.getByTestId('add-task'));

    expect(api.createTask).toHaveBeenCalledWith({ title: 'Write the failing test' });
    expect(await screen.findByText('Write the failing test')).toBeDefined();
    expect(screen.getByTestId<HTMLInputElement>('new-task-title').value).toBe('');
  });

  it('refuses a blank title without calling the API', async () => {
    const api = fakeApi();
    await renderList(api);
    await screen.findByText('No tasks yet.');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('new-task-title'), '   ');
    await user.click(screen.getByTestId('add-task'));

    expect(api.createTask).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toBe('Title must not be empty.');
  });

  it('reports a failure to load without claiming the list is empty-by-choice', async () => {
    const api = fakeApi({ listTasks: vi.fn(() => throwError(() => httpError(500))) });
    await renderList(api);

    expect((await screen.findByRole('alert')).textContent).toBe('Could not load tasks.');
    expect(screen.queryByTestId('unauthorized')).toBeNull();
  });

  it('reports a non-HTTP failure (no status at all) as an ordinary error', async () => {
    const api = fakeApi({ listTasks: vi.fn(() => throwError(() => new Error('network down'))) });
    await renderList(api);

    expect((await screen.findByRole('alert')).textContent).toBe('Could not load tasks.');
    expect(screen.queryByTestId('unauthorized')).toBeNull();
  });

  it('reports a failure to create', async () => {
    const api = fakeApi({ createTask: vi.fn(() => throwError(() => httpError(500))) });
    await renderList(api);
    await screen.findByText('No tasks yet.');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('new-task-title'), 'doomed');
    await user.click(screen.getByTestId('add-task'));

    expect((await screen.findByRole('alert')).textContent).toBe('Could not create the task.');
  });

  describe('when the API answers 401', () => {
    it('renders a distinct unauthorized state instead of a silently empty list', async () => {
      const api = fakeApi({ listTasks: vi.fn(() => throwError(() => httpError(401))) });
      await renderList(api);

      const panel = await screen.findByTestId('unauthorized');
      expect(panel.textContent).toContain('You are not signed in');
      expect(panel.getAttribute('role')).toBe('alert');

      // The critical negative assertions: this must NOT look like "no tasks".
      expect(screen.queryByText('No tasks yet.')).toBeNull();
      expect(screen.queryByTestId('task-list')).toBeNull();
      expect(screen.queryByTestId('add-task')).toBeNull();
      expect(document.querySelector('[data-state]')?.getAttribute('data-state')).toBe(
        'unauthorized',
      );
    });

    it('recovers when a retry succeeds', async () => {
      const listTasks = vi
        .fn<() => Observable<Task[]>>()
        .mockImplementationOnce(() => throwError(() => httpError(401)))
        .mockImplementation(() => of([task('1', 'now visible')]));
      await renderList(fakeApi({ listTasks }));

      await screen.findByTestId('unauthorized');
      await userEvent.setup().click(screen.getByTestId('retry'));

      expect(await screen.findByText('now visible')).toBeDefined();
      expect(screen.queryByTestId('unauthorized')).toBeNull();
    });

    it('treats 403 as an ordinary error, not as "not signed in"', async () => {
      const api = fakeApi({ listTasks: vi.fn(() => throwError(() => httpError(403))) });
      await renderList(api);

      expect((await screen.findByRole('alert')).textContent).toBe('Could not load tasks.');
      expect(screen.queryByTestId('unauthorized')).toBeNull();
    });
  });

  describe('accessibility (axe-core, failing on ANY violation)', () => {
    const scan = async (container: Element): Promise<axe.Result[]> => {
      const results = await axe.run(container, {
        resultTypes: ['violations'],
        // jsdom has no layout engine, so colour-contrast can neither pass nor
        // fail honestly here. It is covered for real by the Playwright/axe ring
        // against a rendered page. Listed as an accepted deviation.
        rules: { 'color-contrast': { enabled: false } },
      });
      return results.violations;
    };

    it('is clean in the populated state', async () => {
      const api = fakeApi({ listTasks: vi.fn(() => of([task('1', 'alpha')])) });
      const { container } = await render(TaskListComponent, {
        providers: [{ provide: TasksService, useValue: api }],
      });
      await screen.findByText('alpha');

      expect(await scan(container)).toEqual([]);
    });

    it('is clean in the unauthorized state', async () => {
      const api = fakeApi({ listTasks: vi.fn(() => throwError(() => httpError(401))) });
      const { container } = await render(TaskListComponent, {
        providers: [{ provide: TasksService, useValue: api }],
      });
      await screen.findByTestId('unauthorized');

      expect(await scan(container)).toEqual([]);
    });
  });
});

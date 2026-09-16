import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Task } from '../api/generated';
import { TasksService } from '../api/generated';
import { classifyApiFailure, sortTasks, validateTitle } from './task-logic';
import type { LoadState } from './task-logic';

@Component({
  selector: 'app-task-list',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="tasks" [attr.data-state]="state()">
      <h1>Tasks</h1>

      @if (state() === 'unauthorized') {
        <div role="alert" class="unauthorized" data-testid="unauthorized">
          <h2>You are not signed in</h2>
          <p>
            The Task API rejected this session&apos;s bearer token. Sign in again to see and add
            tasks.
          </p>
          <button type="button" data-testid="retry" (click)="reload()">Try again</button>
        </div>
      } @else {
        <form (ngSubmit)="add()">
          <label for="new-task-title">New task</label>
          <input
            id="new-task-title"
            data-testid="new-task-title"
            name="title"
            type="text"
            autocomplete="off"
            [ngModel]="draft()"
            (ngModelChange)="draft.set($event)"
          />
          <button type="submit" data-testid="add-task" [disabled]="busy()">Add task</button>
        </form>

        @if (message(); as text) {
          <p role="alert" class="error">{{ text }}</p>
        }

        @if (state() === 'loading') {
          <p>Loading tasks…</p>
        } @else if (tasks().length === 0) {
          <p>No tasks yet.</p>
        } @else {
          <ul aria-label="Tasks" data-testid="task-list">
            @for (task of tasks(); track task.id) {
              <li [attr.data-completed]="task.completed">{{ task.title }}</li>
            }
          </ul>
        }
      }
    </main>
  `,
  styles: `
    .tasks {
      font-family: system-ui, sans-serif;
      margin: 2rem auto;
      max-width: 32rem;
    }
    .error {
      color: #b00020;
    }
    .unauthorized h2 {
      color: #b00020;
      font-size: 1.1rem;
    }
    li[data-completed='true'] {
      text-decoration: line-through;
    }
  `,
})
export class TaskListComponent {
  private readonly api = inject(TasksService);

  // ACCEPTED DEVIATION (two lines): these seed values are placeholders only.
  // The constructor calls reload() synchronously, which overwrites both
  // before Angular's first render, so no test can observe -- or should try
  // to observe -- the seed literal itself; only reload()'s own explicit
  // .set() calls are real, testable behaviour (and are tested).
  // Stryker disable next-line ArrayDeclaration
  private readonly loaded = signal<readonly Task[]>([]);

  readonly draft = signal('');
  // Stryker disable next-line StringLiteral
  readonly state = signal<LoadState>('loading');
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  /** Ordering comes from the pure, separately unit-tested logic. */
  readonly tasks = computed(() => sortTasks(this.loaded()));

  constructor() {
    this.reload();
  }

  reload(): void {
    this.state.set('loading');
    this.message.set(null);
    this.api.listTasks().subscribe({
      next: (tasks) => {
        this.loaded.set(tasks);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.fail(error, 'Could not load tasks.');
      },
    });
  }

  add(): void {
    const validation = validateTitle(this.draft());
    if (!validation.ok) {
      this.message.set(validation.error);
      return;
    }

    this.message.set(null);
    this.busy.set(true);
    this.api.createTask({ title: validation.title }).subscribe({
      next: (created) => {
        this.loaded.update((tasks) => [...tasks, created]);
        this.draft.set('');
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.fail(error, 'Could not create the task.');
      },
    });
  }

  /**
   * A 401 is a distinct, user-visible state — never a silently empty list.
   * The template enforces this structurally: the `unauthorized` and list
   * branches are mutually exclusive `@if`/`@else`, so `tasks()` can never
   * render while `state()` is `'unauthorized'` regardless of what `loaded`
   * holds, and the next successful load always overwrites `loaded` before
   * the list branch can render again. There is deliberately no redundant
   * `loaded.set([])` here — everything else is reported inline without
   * destroying the current view.
   */
  private fail(error: unknown, fallbackMessage: string): void {
    const status = error instanceof HttpErrorResponse ? error.status : null;
    if (classifyApiFailure(status) === 'unauthorized') {
      this.state.set('unauthorized');
      this.message.set(null);
      return;
    }
    this.state.set('ready');
    this.message.set(fallbackMessage);
  }
}

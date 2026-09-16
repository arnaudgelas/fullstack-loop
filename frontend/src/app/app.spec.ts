import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from './api/generated';
import { TasksService } from './api/generated';
import { AppComponent } from './app';
import { routes } from './app.routes';

const api = {
  listTasks: vi.fn(() => of<Task[]>([{ id: '1', title: 'routed task', completed: false }])),
};

async function renderAt(url: string): Promise<void> {
  await render(AppComponent, {
    providers: [
      provideRouter(routes),
      provideLocationMocks(),
      { provide: TasksService, useValue: api },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
}

describe('AppComponent routing', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the task list at the /tasks deep link', async () => {
    await renderAt('/tasks');

    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeDefined();
    expect(await screen.findByText('routed task')).toBeDefined();
  });

  it('redirects the root path to /tasks', async () => {
    await renderAt('/');

    expect(TestBed.inject(Router).url).toBe('/tasks');
  });

  it('sends an unknown deep link to /tasks rather than a blank page', async () => {
    await renderAt('/does-not-exist');

    expect(TestBed.inject(Router).url).toBe('/tasks');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks' })).toBeDefined();
  });
});

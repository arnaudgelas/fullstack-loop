import type { Routes } from '@angular/router';

/**
 * Real routes, so an e2e deep link to /tasks is an actual navigation rather
 * than an accident of the nginx SPA fallback.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tasks' },
  {
    path: 'tasks',
    title: 'Tasks · Fullstack Loop',
    loadComponent: async () => (await import('./tasks/task-list')).TaskListComponent,
  },
  { path: '**', redirectTo: 'tasks' },
];

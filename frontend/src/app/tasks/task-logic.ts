import type { Task } from '../api/generated';

/**
 * Pure, framework-free logic for the task feature.
 *
 * This is the target of the INNER ring: no Angular, no HTTP, no DOM, so
 * it can be driven RED -> GREEN -> REFACTOR with Vitest alone, and it is what
 * Stryker mutates.
 */

/** Upper bound taken from `NewTask.title.maxLength` in openapi/openapi.yaml. */
export const TITLE_MAX_LENGTH = 200;

export type TitleValidation =
  { readonly ok: true; readonly title: string } | { readonly ok: false; readonly error: string };

/** The states the task view can be in. `unauthorized` is deliberately its own. */
export type LoadState = 'loading' | 'ready' | 'unauthorized';

export type ApiFailure = 'unauthorized' | 'other';

/** Collapses runs of whitespace and trims the ends. */
export function normalizeTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Validates a user-entered title against the contract's `NewTask` schema.
 * Returns the normalized title on success, a human-readable reason on failure.
 */
export function validateTitle(raw: string): TitleValidation {
  const title = normalizeTitle(raw);
  if (title.length === 0) {
    return { ok: false, error: 'Title must not be empty.' };
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Title must be at most ${String(TITLE_MAX_LENGTH)} characters.`,
    };
  }
  return { ok: true, title };
}

/**
 * Maps an HTTP status onto the failure kinds the UI distinguishes.
 *
 * The contract declares `bearerAuth` at the root and a `401` on every
 * operation, so a missing/expired/invalid token is a first-class outcome, not
 * a generic error. A 403 (valid token, missing scope) is a different problem
 * and is reported as an ordinary failure.
 */
export function classifyApiFailure(status: number | null): ApiFailure {
  return status === 401 ? 'unauthorized' : 'other';
}

/**
 * Presentation order: outstanding work first, then completed work; within each
 * group, case-insensitive alphabetical by title, with the id as a stable
 * tie-breaker so the order never depends on input order.
 */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    const byTitle = a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
    return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
  });
}

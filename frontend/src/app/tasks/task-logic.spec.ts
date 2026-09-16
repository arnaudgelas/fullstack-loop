import { describe, expect, it } from 'vitest';
import type { Task } from '../api/generated';
import {
  TITLE_MAX_LENGTH,
  classifyApiFailure,
  normalizeTitle,
  sortTasks,
  validateTitle,
} from './task-logic';

const task = (id: string, title: string, completed = false): Task => ({ id, title, completed });

describe('normalizeTitle', () => {
  it('trims the ends', () => {
    expect(normalizeTitle('  write the test  ')).toBe('write the test');
  });

  it('collapses internal whitespace runs, including newlines and tabs', () => {
    expect(normalizeTitle('write\t the\n\n test')).toBe('write the test');
  });

  it('leaves an already normal title alone', () => {
    expect(normalizeTitle('write the test')).toBe('write the test');
  });
});

describe('validateTitle', () => {
  it('accepts a normal title and returns it normalized', () => {
    expect(validateTitle('  Write   the failing test ')).toEqual({
      ok: true,
      title: 'Write the failing test',
    });
  });

  it('rejects an empty title', () => {
    expect(validateTitle('')).toEqual({ ok: false, error: 'Title must not be empty.' });
  });

  it('rejects a whitespace-only title', () => {
    expect(validateTitle('  \n\t ')).toEqual({ ok: false, error: 'Title must not be empty.' });
  });

  it('accepts a single character', () => {
    expect(validateTitle('a')).toEqual({ ok: true, title: 'a' });
  });

  it(`accepts exactly ${String(TITLE_MAX_LENGTH)} characters`, () => {
    expect(validateTitle('a'.repeat(TITLE_MAX_LENGTH))).toEqual({
      ok: true,
      title: 'a'.repeat(TITLE_MAX_LENGTH),
    });
  });

  it(`rejects ${String(TITLE_MAX_LENGTH + 1)} characters`, () => {
    expect(validateTitle('a'.repeat(TITLE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: `Title must be at most ${String(TITLE_MAX_LENGTH)} characters.`,
    });
  });

  it('measures length after normalization, not before', () => {
    expect(validateTitle(`  ${'a'.repeat(TITLE_MAX_LENGTH)}  `).ok).toBe(true);
  });
});

describe('classifyApiFailure', () => {
  it('treats 401 as unauthorized', () => {
    expect(classifyApiFailure(401)).toBe('unauthorized');
  });

  it('treats 403 as an ordinary failure — a valid token missing a scope is a different problem', () => {
    expect(classifyApiFailure(403)).toBe('other');
  });

  it.each([400, 404, 500, 0])('treats %i as an ordinary failure', (status) => {
    expect(classifyApiFailure(status)).toBe('other');
  });

  it('treats a non-HTTP failure as an ordinary failure', () => {
    expect(classifyApiFailure(null)).toBe('other');
  });
});

describe('sortTasks', () => {
  it('puts outstanding tasks before completed ones', () => {
    const sorted = sortTasks([task('1', 'alpha', true), task('2', 'beta', false)]);
    expect(sorted.map((t) => t.id)).toEqual(['2', '1']);
  });

  it('keeps an already outstanding-first pair in place', () => {
    const sorted = sortTasks([task('1', 'alpha', false), task('2', 'beta', true)]);
    expect(sorted.map((t) => t.id)).toEqual(['1', '2']);
  });

  it('orders alphabetically, case-insensitively, within a group', () => {
    const sorted = sortTasks([task('1', 'beta'), task('2', 'Alpha'), task('3', 'gamma')]);
    expect(sorted.map((t) => t.title)).toEqual(['Alpha', 'beta', 'gamma']);
  });

  it('compares titles by base letter, so case alone never changes the order', () => {
    // Kills the mutant that drops { sensitivity: 'base' }: without it, 'alpha'
    // and 'Alpha' are distinct and sort by case instead of tying on the id.
    const sorted = sortTasks([task('b', 'alpha'), task('a', 'Alpha')]);
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('breaks ties on id so the order is stable regardless of input order', () => {
    const forwards = sortTasks([task('b', 'same'), task('a', 'same')]);
    const backwards = sortTasks([task('a', 'same'), task('b', 'same')]);
    expect(forwards.map((t) => t.id)).toEqual(['a', 'b']);
    expect(backwards.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [task('1', 'zulu'), task('2', 'alpha')];
    sortTasks(input);
    expect(input.map((t) => t.id)).toEqual(['1', '2']);
  });

  it('handles an empty list', () => {
    expect(sortTasks([])).toEqual([]);
  });
});

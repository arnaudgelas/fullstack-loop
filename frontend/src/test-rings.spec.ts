import { readdirSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INNER_RING_SOURCES,
  INNER_RING_SPECS,
  MIDDLE_RING_SOURCES,
  MIDDLE_RING_SPECS,
} from '../vitest.rings';

const projectRoot = resolve(import.meta.dirname, '..');

function filesUnder(directory: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      // The generated client is produced by openapi-generator and is neither
      // tested nor covered here; see QUALITY-GATES.md "Contract / codegen".
      if (entry.name !== 'generated') {
        found.push(...filesUnder(full, suffix));
      }
    } else if (entry.name.endsWith(suffix)) {
      found.push(
        full
          .slice(projectRoot.length + 1)
          .split(sep)
          .join(posix.sep),
      );
    }
  }
  return found.sort((a, b) => a.localeCompare(b));
}

/**
 * The CI gate reports `test:unit` and `test:component` as separate steps so a
 * failure names the ring it happened in. That only means anything if every
 * spec belongs to exactly one ring and every source is covered by one of them.
 * These assertions are what keep that true as files are added.
 */
describe('ring membership', () => {
  const allSpecs = filesUnder(resolve(projectRoot, 'src'), '.spec.ts');
  const classifiedSpecs = [...INNER_RING_SPECS, ...MIDDLE_RING_SPECS].sort((a, b) =>
    a.localeCompare(b),
  );

  it('assigns every spec file on disk to exactly one ring', () => {
    expect(classifiedSpecs).toEqual(allSpecs);
  });

  it('never puts the same spec in both rings', () => {
    const overlap = INNER_RING_SPECS.filter((spec) => MIDDLE_RING_SPECS.includes(spec));
    expect(overlap).toEqual([]);
  });

  it('never makes two rings responsible for the same source file', () => {
    const overlap = INNER_RING_SOURCES.filter((source) => MIDDLE_RING_SOURCES.includes(source));
    expect(overlap).toEqual([]);
  });

  it('assigns every non-generated source file to a ring or to the documented exclusions', () => {
    // app.config.ts is a composition root: provider wiring with no behaviour,
    // exercised for real by the Playwright ring. main.ts is the bootstrap
    // entry point, likewise. Everything else must belong to a ring.
    const excluded = ['src/main.ts', 'src/test-setup.ts', 'src/app/app.config.ts'];
    const owned = [...INNER_RING_SOURCES, ...MIDDLE_RING_SOURCES, ...excluded];

    const unowned = filesUnder(resolve(projectRoot, 'src'), '.ts').filter(
      (file) => !file.endsWith('.spec.ts') && !owned.includes(file),
    );

    expect(unowned).toEqual([]);
  });
});

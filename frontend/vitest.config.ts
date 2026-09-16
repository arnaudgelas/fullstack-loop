/// <reference types="vitest" />
import { defineConfig } from 'vite';
import {
  INNER_RING_SOURCES,
  INNER_RING_SPECS,
  MIDDLE_RING_SOURCES,
  MIDDLE_RING_SPECS,
} from './vitest.rings';
import { ringConfig } from './vitest.shared';

/**
 * The aggregate INNER + MIDDLE run: every spec, every source, one coverage
 * report. `npm test` uses this, `npm run verify` uses `npm test`, and the
 * Docker image build uses `npm run verify` — so whole-codebase coverage
 * enforcement lives here and cannot evaporate into the per-ring splits.
 *
 * Its include list is the UNION of the two rings rather than a wildcard, and
 * src/test-rings.spec.ts asserts that the union really is every spec on disk.
 */
export default defineConfig(
  ringConfig({
    include: [...INNER_RING_SPECS, ...MIDDLE_RING_SPECS],
    coverageInclude: [...INNER_RING_SOURCES, ...MIDDLE_RING_SOURCES],
    coverageDirectory: 'coverage',
  }),
);

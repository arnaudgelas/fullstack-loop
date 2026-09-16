/**
 * The INNER/MIDDLE ring membership of every frontend spec file (see README.md).
 *
 * Plain data with no imports, so both the Vitest configs and the guard test
 * (src/test-rings.spec.ts) can read it without dragging Vite plugins into a
 * jsdom test run.
 *
 * The rings are split by an explicit list rather than a glob so classification
 * is a deliberate act. The guard test fails if any spec on disk is missing from
 * both lists, which is what stops the CI gate's per-ring reporting from
 * degenerating into theatre.
 */

/** INNER ring — pure logic. No Angular, no TestBed, no DOM. */
export const INNER_RING_SPECS = [
  'src/app/tasks/task-logic.spec.ts',
  'src/app/runtime-config.spec.ts',
  'src/test-rings.spec.ts',
];

/** Sources the INNER ring is solely responsible for covering. */
export const INNER_RING_SOURCES = ['src/app/tasks/task-logic.ts', 'src/app/runtime-config.ts'];

/** MIDDLE ring — Angular: Testing Library components, DI, the HTTP adapter. */
export const MIDDLE_RING_SPECS = [
  'src/app/tasks/task-list.spec.ts',
  'src/app/app.spec.ts',
  'src/app/auth/auth.interceptor.spec.ts',
  'src/app/auth/token-provider.spec.ts',
];

/** Sources the MIDDLE ring is solely responsible for covering. */
export const MIDDLE_RING_SOURCES = [
  'src/app/tasks/task-list.ts',
  'src/app/app.ts',
  'src/app/app.routes.ts',
  'src/app/auth/auth.interceptor.ts',
  'src/app/auth/token-provider.ts',
];

/** Consumer-contract ring — executed separately because Pact starts a mock server. */
export const PACT_SPECS = ['test/pact/tasks.pact.spec.ts'];

/**
 * Coverage exclusions that apply to every run.
 *
 * `src/app/api/generated/**` is produced by openapi-generator, so covering it
 * would measure the generator (QUALITY-GATES.md "Contract / codegen" permits
 * excluding it). `app.config.ts` is a composition root: provider wiring with no
 * behaviour of its own, exercised for real by the Playwright ring.
 */
export const COVERAGE_EXCLUDE = [
  'src/app/api/generated/**',
  'src/**/*.spec.ts',
  'src/app/app.config.ts',
];

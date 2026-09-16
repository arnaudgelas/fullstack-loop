// @ts-check
/**
 * the scoped mutation-testing gate for the frontend.
 *
 * Scoped deliberately: the pure logic module and the auth/runtime seams are
 * where a surviving mutant means a genuinely missing assertion. Angular
 * component classes are dominated by framework wiring that mutates into
 * non-equivalent-but-untestable states, so they are covered by the component
 * ring instead.
 *
 * `thresholds.break` fails the command — this is a gate, not a report.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  reporters: ['clear-text', 'progress'],
  mutate: [
    'src/app/tasks/task-logic.ts',
    'src/app/auth/auth.interceptor.ts',
    'src/app/auth/token-provider.ts',
    'src/app/runtime-config.ts',
  ],
  coverageAnalysis: 'perTest',
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
  thresholds: { high: 100, low: 100, break: 100 },
  ignorePatterns: ['dist', 'coverage', 'reports', '.angular', 'out-tsc', 'pacts'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
};

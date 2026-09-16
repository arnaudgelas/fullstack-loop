import angular from '@analogjs/vite-plugin-angular';
import type { UserConfig } from 'vite';
import { COVERAGE_EXCLUDE } from './vitest.rings';

/**
 * Shared Vitest wiring for the frontend's INNER/MIDDLE test rings (see README.md).
 *
 * Route taken: @analogjs/vite-plugin-angular + vitest + jsdom. The plugin runs
 * the Angular AOT compiler over .ts sources, so inline component templates and
 * decorators compile without the Angular CLI test builder.
 *
 * Every ring carries real coverage thresholds — a miss fails the run, and
 * therefore the image build.
 */
export function ringConfig(options: {
  include: readonly string[];
  coverageInclude: readonly string[];
  coverageDirectory: string;
}): UserConfig {
  return {
    plugins: [angular()],
    resolve: {
      conditions: ['style'],
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: [...options.include],
      allowOnly: false,
      passWithNoTests: false,
      reporters: ['default'],
      pool: 'forks',
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'lcov'],
        reportsDirectory: options.coverageDirectory,
        include: [...options.coverageInclude],
        exclude: COVERAGE_EXCLUDE,
        thresholds: {
          // 100% across the board today; the gate exists to stop it slipping.
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 100,
        },
      },
    },
    define: {
      'import.meta.vitest': 'undefined',
    },
  };
}

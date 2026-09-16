/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';
import { PACT_SPECS } from './vitest.rings';

/**
 * PACT CONSUMER ring of the development loop. Kept in its own config (and out of the image
 * build) because it downloads/starts the native pact mock server, which is far
 * slower than the inner/middle rings and needs to bind a local port.
 *
 * Run with: npm run test:pact
 */
export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: PACT_SPECS,
    allowOnly: false,
    passWithNoTests: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    fileParallelism: false,
  },
});

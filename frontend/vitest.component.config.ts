/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { MIDDLE_RING_SOURCES, MIDDLE_RING_SPECS } from './vitest.rings';
import { ringConfig } from './vitest.shared';

/**
 * MIDDLE ring: Testing Library component tests plus the Angular DI and
 * HTTP adapter seams, with the HTTP layer faked. A failure here names the ring.
 */
export default defineConfig(
  ringConfig({
    include: MIDDLE_RING_SPECS,
    coverageInclude: MIDDLE_RING_SOURCES,
    coverageDirectory: 'coverage/component',
  }),
);

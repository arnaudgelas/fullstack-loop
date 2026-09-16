/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { INNER_RING_SOURCES, INNER_RING_SPECS } from './vitest.rings';
import { ringConfig } from './vitest.shared';

/**
 * INNER ring: pure logic, driven RED -> GREEN -> REFACTOR with Vitest
 * alone. A failure here names the ring — a broken pure function cannot be
 * reported as a component failure, and vice versa.
 */
export default defineConfig(
  ringConfig({
    include: INNER_RING_SPECS,
    coverageInclude: INNER_RING_SOURCES,
    coverageDirectory: 'coverage/unit',
  }),
);

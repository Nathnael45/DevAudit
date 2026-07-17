import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Tests share one Postgres instance and truncate tables between runs —
    // running test files in parallel would race those truncations.
    fileParallelism: false,
  },
});

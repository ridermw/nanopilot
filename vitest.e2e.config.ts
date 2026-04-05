import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 120_000, // 2 min per test (live mode needs time)
    hookTimeout: 60_000,
  },
});

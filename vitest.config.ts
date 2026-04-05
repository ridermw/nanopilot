import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'setup/**/*.test.ts',
      'test/chaos/**/*.test.ts',
    ],
    // E2E tests have their own config (vitest.e2e.config.ts)
    exclude: ['test/e2e/**', 'node_modules/**'],
  },
});

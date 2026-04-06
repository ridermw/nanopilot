import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'setup/**/*.test.ts',
      'test/chaos/**/*.test.ts',
      'test/contracts/**/*.test.ts',
    ],
    // E2E tests have their own config (vitest.e2e.config.ts)
    exclude: ['test/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/channels/index.ts', // barrel file
        'src/types.ts', // pure type definitions
      ],
      thresholds: {
        lines: 76.01,
        branches: 68.41,
        functions: 73.36,
        statements: 75.2,
        autoUpdate: true,
      },
    },
  },
});

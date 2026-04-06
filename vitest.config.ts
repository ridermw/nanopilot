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
        lines: 87.58,
        branches: 81.58,
        functions: 80,
        statements: 86.76,
        autoUpdate: true,
        'src/ipc.ts': {
          statements: 100,
          branches: 95.12,
          functions: 100,
          lines: 100,
        },
        'src/container-runner.ts': {
          statements: 99.03,
          branches: 89.53,
          functions: 100,
          lines: 100,
        },
        'src/index.ts': {
          statements: 55.16,
          branches: 55.64,
          functions: 38.63,
          lines: 56.39,
        },
      },
    },
  },
});

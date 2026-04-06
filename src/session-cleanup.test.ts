import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedExecFile = vi.mocked(execFile);

describe('session-cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules cleanup 30s after startup', async () => {
    const { startSessionCleanup } = await import('./session-cleanup.js');
    startSessionCleanup();

    expect(mockedExecFile).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);

    expect(mockedExecFile).toHaveBeenCalledTimes(1);
    expect(mockedExecFile).toHaveBeenCalledWith(
      '/bin/bash',
      [expect.stringContaining('cleanup-sessions.sh')],
      { timeout: 60_000 },
      expect.any(Function),
    );
  });

  it('runs cleanup every 24 hours after initial run', async () => {
    vi.resetModules();
    const { startSessionCleanup } = await import('./session-cleanup.js');
    startSessionCleanup();

    // Initial 30s delay
    vi.advanceTimersByTime(30_000);
    expect(mockedExecFile).toHaveBeenCalledTimes(1);

    // 24 hours later
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockedExecFile).toHaveBeenCalledTimes(2);

    // Another 24 hours
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockedExecFile).toHaveBeenCalledTimes(3);
  });

  it('logs summary on successful cleanup', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');
    const { startSessionCleanup } = await import('./session-cleanup.js');

    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(
        null,
        '[cleanup] Done — freed ~128K\n',
      );
      return undefined as any;
    });

    startSessionCleanup();
    vi.advanceTimersByTime(30_000);

    expect(logger.info).toHaveBeenCalledWith('[cleanup] Done — freed ~128K');
  });

  it('logs error when cleanup script fails', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');
    const { startSessionCleanup } = await import('./session-cleanup.js');

    const err = new Error('script failed');
    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(err, '');
      return undefined as any;
    });

    startSessionCleanup();
    vi.advanceTimersByTime(30_000);

    expect(logger.error).toHaveBeenCalledWith(
      { err },
      'Session cleanup failed',
    );
  });

  it('does not log when stdout is empty', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');
    const { startSessionCleanup } = await import('./session-cleanup.js');

    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, '');
      return undefined as any;
    });

    startSessionCleanup();
    vi.advanceTimersByTime(30_000);

    expect(logger.info).not.toHaveBeenCalled();
  });
});

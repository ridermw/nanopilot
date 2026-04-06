import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;
  let originalLogLevel: string | undefined;

  beforeEach(() => {
    originalLogLevel = process.env.LOG_LEVEL;
    stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  it('writes info messages to stdout', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.info('test message');

    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('INFO'));
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('test message'),
    );
  });

  it('writes warn messages to stderr', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.warn('warning message');

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('WARN'));
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('warning message'),
    );
  });

  it('writes error messages to stderr', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.error('error message');

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
  });

  it('writes fatal messages to stderr', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.fatal('fatal message');

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('FATAL'));
  });

  it('includes structured data in output', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.info({ key: 'value', count: 42 }, 'structured');

    const output = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(output).toContain('structured');
    expect(output).toContain('key');
    expect(output).toContain('"value"');
  });

  it('formats Error objects with stack traces', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    const err = new Error('test error');
    logger.error({ err }, 'something broke');

    const output = stderrWrite.mock.calls[0]?.[0] as string;
    expect(output).toContain('test error');
    expect(output).toContain('err');
  });

  it('formats non-Error objects in err field', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.error({ err: { custom: 'object' } }, 'non-error');

    const output = stderrWrite.mock.calls[0]?.[0] as string;
    expect(output).toContain('custom');
  });

  it('includes timestamp in output', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.info('ts check');

    const output = stdoutWrite.mock.calls[0]?.[0] as string;
    // Timestamp format: [HH:MM:SS.mmm]
    expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  it('includes process PID in output', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.info('pid check');

    const output = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(output).toContain(`(${process.pid})`);
  });

  it('filters debug messages when LOG_LEVEL=info', async () => {
    originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info';
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.debug('should be filtered');

    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it('allows debug messages when LOG_LEVEL=debug', async () => {
    originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'debug';
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.debug('should appear');

    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('DEBUG'));
  });

  it('handles string-only argument (no data object)', async () => {
    vi.resetModules();
    const { logger } = await import('./logger.js');

    logger.info('just a string');

    const output = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(output).toContain('just a string');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs');
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import fs from 'fs';
import { logger } from './logger.js';
import { readEnvFile } from './env.js';

const mockedFs = vi.mocked(fs);

describe('env / readEnvFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty object when .env file does not exist', () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = readEnvFile(['KEY1']);

    expect(result).toEqual({});
    expect(logger.debug).toHaveBeenCalled();
  });

  it('parses unquoted values', () => {
    mockedFs.readFileSync.mockReturnValue('MY_KEY=my_value\n');

    const result = readEnvFile(['MY_KEY']);

    expect(result).toEqual({ MY_KEY: 'my_value' });
  });

  it('parses double-quoted values', () => {
    mockedFs.readFileSync.mockReturnValue('KEY="hello world"\n');

    const result = readEnvFile(['KEY']);

    expect(result).toEqual({ KEY: 'hello world' });
  });

  it('parses single-quoted values', () => {
    mockedFs.readFileSync.mockReturnValue("KEY='hello world'\n");

    const result = readEnvFile(['KEY']);

    expect(result).toEqual({ KEY: 'hello world' });
  });

  it('skips comment lines', () => {
    mockedFs.readFileSync.mockReturnValue('# This is a comment\nKEY=value\n');

    const result = readEnvFile(['KEY']);

    expect(result).toEqual({ KEY: 'value' });
  });

  it('skips empty lines', () => {
    mockedFs.readFileSync.mockReturnValue('\n\nKEY=value\n\n');

    const result = readEnvFile(['KEY']);

    expect(result).toEqual({ KEY: 'value' });
  });

  it('skips lines without = sign', () => {
    mockedFs.readFileSync.mockReturnValue('MALFORMED_LINE\nKEY=value\n');

    const result = readEnvFile(['MALFORMED_LINE', 'KEY']);

    expect(result).toEqual({ KEY: 'value' });
  });

  it('only returns requested keys (security filter)', () => {
    mockedFs.readFileSync.mockReturnValue('SECRET=hidden\nPUBLIC=visible\n');

    const result = readEnvFile(['PUBLIC']);

    expect(result).toEqual({ PUBLIC: 'visible' });
    expect(result).not.toHaveProperty('SECRET');
  });

  it('handles empty value (KEY=) by excluding it', () => {
    mockedFs.readFileSync.mockReturnValue('KEY=\n');

    const result = readEnvFile(['KEY']);

    // Empty values are excluded (if (value) check)
    expect(result).toEqual({});
  });

  it('handles values with = signs in them', () => {
    mockedFs.readFileSync.mockReturnValue('KEY=a=b=c\n');

    const result = readEnvFile(['KEY']);

    expect(result).toEqual({ KEY: 'a=b=c' });
  });

  it('trims whitespace around keys and values', () => {
    mockedFs.readFileSync.mockReturnValue('  KEY  =  value  \n');

    const result = readEnvFile(['KEY']);

    expect(result).toEqual({ KEY: 'value' });
  });

  it('handles multiple requested keys', () => {
    mockedFs.readFileSync.mockReturnValue('A=1\nB=2\nC=3\n');

    const result = readEnvFile(['A', 'C']);

    expect(result).toEqual({ A: '1', C: '3' });
  });

  it('returns empty object for empty file', () => {
    mockedFs.readFileSync.mockReturnValue('');

    const result = readEnvFile(['KEY']);

    expect(result).toEqual({});
  });

  it('returns empty object when no keys requested', () => {
    mockedFs.readFileSync.mockReturnValue('KEY=value\n');

    const result = readEnvFile([]);

    expect(result).toEqual({});
  });
});

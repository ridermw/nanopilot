/**
 * Expanded platform tests — covers branching logic with spied OS/fs/child_process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import {
  getPlatform,
  isWSL,
  isRoot,
  isHeadless,
  hasSystemd,
  openBrowser,
  getServiceManager,
  getNodePath,
  commandExists,
  getNodeVersion,
  getNodeMajorVersion,
} from './platform.js';

let platformSpy: ReturnType<typeof vi.spyOn>;
let readFileSpy: ReturnType<typeof vi.spyOn>;

vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue(''),
}));

beforeEach(() => {
  vi.clearAllMocks();
  platformSpy = vi.spyOn(os, 'platform');
  readFileSpy = vi.spyOn(fs, 'readFileSync');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPlatform (branching)', () => {
  it('returns macos for darwin', () => {
    platformSpy.mockReturnValue('darwin');
    expect(getPlatform()).toBe('macos');
  });

  it('returns linux for linux', () => {
    platformSpy.mockReturnValue('linux');
    expect(getPlatform()).toBe('linux');
  });

  it('returns unknown for win32', () => {
    platformSpy.mockReturnValue('win32');
    expect(getPlatform()).toBe('unknown');
  });
});

describe('isWSL (branching)', () => {
  it('returns false on darwin', () => {
    platformSpy.mockReturnValue('darwin');
    expect(isWSL()).toBe(false);
  });

  it('returns true when /proc/version contains Microsoft', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockReturnValue(
      'Linux version 5.15.0-1-Microsoft standard WSL2'
    );
    expect(isWSL()).toBe(true);
  });

  it('returns true when /proc/version contains wsl', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockReturnValue(
      'Linux version 5.15.0 wsl2'
    );
    expect(isWSL()).toBe(true);
  });

  it('returns false on regular linux', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockReturnValue(
      'Linux version 5.15.0-generic'
    );
    expect(isWSL()).toBe(false);
  });

  it('returns false when /proc/version is unreadable', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(isWSL()).toBe(false);
  });
});

describe('isHeadless (branching)', () => {
  const originalDisplay = process.env.DISPLAY;
  const originalWayland = process.env.WAYLAND_DISPLAY;

  afterEach(() => {
    if (originalDisplay !== undefined) process.env.DISPLAY = originalDisplay;
    else delete process.env.DISPLAY;
    if (originalWayland !== undefined) process.env.WAYLAND_DISPLAY = originalWayland;
    else delete process.env.WAYLAND_DISPLAY;
  });

  it('returns false on macOS even without DISPLAY', () => {
    platformSpy.mockReturnValue('darwin');
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    expect(isHeadless()).toBe(false);
  });

  it('returns true on linux without DISPLAY or WAYLAND_DISPLAY', () => {
    platformSpy.mockReturnValue('linux');
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    expect(isHeadless()).toBe(true);
  });

  it('returns false on linux with DISPLAY set', () => {
    platformSpy.mockReturnValue('linux');
    process.env.DISPLAY = ':0';
    delete process.env.WAYLAND_DISPLAY;
    expect(isHeadless()).toBe(false);
  });

  it('returns false on linux with WAYLAND_DISPLAY set', () => {
    platformSpy.mockReturnValue('linux');
    delete process.env.DISPLAY;
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    expect(isHeadless()).toBe(false);
  });
});

describe('hasSystemd (branching)', () => {
  it('returns false on macOS', () => {
    platformSpy.mockReturnValue('darwin');
    expect(hasSystemd()).toBe(false);
  });

  it('returns true when /proc/1/comm is systemd', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockReturnValue('systemd\n');
    expect(hasSystemd()).toBe(true);
  });

  it('returns false when init is not systemd', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockReturnValue('init\n');
    expect(hasSystemd()).toBe(false);
  });

  it('returns false when /proc/1/comm is unreadable', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(hasSystemd()).toBe(false);
  });
});

describe('openBrowser (branching)', () => {
  it('uses open on macOS', () => {
    platformSpy.mockReturnValue('darwin');
    vi.mocked(execSync as any).mockReturnValue('');
    const result = openBrowser('https://example.com');
    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('open'),
      expect.anything(),
    );
  });

  it('uses xdg-open on linux (non-WSL)', () => {
    platformSpy.mockReturnValue('linux');
    // readFileSync for WSL check
    readFileSpy.mockReturnValue('Linux version 5.15.0-generic');
    vi.mocked(execSync as any).mockReturnValue('');
    const result = openBrowser('https://example.com');
    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('xdg-open'),
      expect.anything(),
    );
  });

  it('returns false on unknown platform', () => {
    platformSpy.mockReturnValue('win32');
    const result = openBrowser('https://example.com');
    expect(result).toBe(false);
  });

  it('returns false when command fails', () => {
    platformSpy.mockReturnValue('darwin');
    vi.mocked(execSync as any).mockImplementation(() => {
      throw new Error('Command failed');
    });
    const result = openBrowser('https://example.com');
    expect(result).toBe(false);
  });
});

describe('getServiceManager (branching)', () => {
  it('returns launchd on macOS', () => {
    platformSpy.mockReturnValue('darwin');
    expect(getServiceManager()).toBe('launchd');
  });

  it('returns systemd on linux with systemd', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockReturnValue('systemd\n');
    expect(getServiceManager()).toBe('systemd');
  });

  it('returns none on linux without systemd', () => {
    platformSpy.mockReturnValue('linux');
    readFileSpy.mockReturnValue('init\n');
    expect(getServiceManager()).toBe('none');
  });

  it('returns none on unknown platform', () => {
    platformSpy.mockReturnValue('win32');
    expect(getServiceManager()).toBe('none');
  });
});

describe('getNodePath', () => {
  it('returns the node path from command -v', () => {
    vi.mocked(execSync as any).mockReturnValue('/usr/local/bin/node\n');
    expect(getNodePath()).toBe('/usr/local/bin/node');
  });

  it('falls back to process.execPath on error', () => {
    vi.mocked(execSync as any).mockImplementation(() => {
      throw new Error('Command failed');
    });
    expect(getNodePath()).toBe(process.execPath);
  });
});

describe('getNodeVersion', () => {
  it('returns version without v prefix', () => {
    vi.mocked(execSync as any).mockReturnValue('v22.4.0\n');
    expect(getNodeVersion()).toBe('22.4.0');
  });

  it('returns null when node is not found', () => {
    vi.mocked(execSync as any).mockImplementation(() => {
      throw new Error('Command not found');
    });
    expect(getNodeVersion()).toBeNull();
  });
});

describe('getNodeMajorVersion', () => {
  it('returns major version number', () => {
    vi.mocked(execSync as any).mockReturnValue('v22.4.0\n');
    expect(getNodeMajorVersion()).toBe(22);
  });

  it('returns null when version unavailable', () => {
    vi.mocked(execSync as any).mockImplementation(() => {
      throw new Error('Command not found');
    });
    expect(getNodeMajorVersion()).toBeNull();
  });
});

describe('commandExists', () => {
  it('returns true when command exists', () => {
    vi.mocked(execSync as any).mockReturnValue('');
    expect(commandExists('node')).toBe(true);
  });

  it('returns false when command does not exist', () => {
    vi.mocked(execSync as any).mockImplementation(() => {
      throw new Error('Command not found');
    });
    expect(commandExists('nonexistent')).toBe(false);
  });
});

describe('isRoot (branching)', () => {
  it('returns false when getuid returns non-zero', () => {
    const spy = vi.spyOn(process, 'getuid').mockReturnValue(1000);
    expect(isRoot()).toBe(false);
    spy.mockRestore();
  });

  it('returns true when getuid returns 0', () => {
    const spy = vi.spyOn(process, 'getuid').mockReturnValue(0);
    expect(isRoot()).toBe(true);
    spy.mockRestore();
  });
});

/**
 * Real-environment smoke tests — no mocks, verifies actual host integration.
 * These complement platform-expanded.test.ts which uses mocked OS/fs/child_process.
 */
import { describe, it, expect } from 'vitest';

import {
  getPlatform,
  getServiceManager,
  commandExists,
  getNodeVersion,
  getNodeMajorVersion,
} from './platform.js';

describe('platform smoke (real environment)', () => {
  it('commandExists returns true for node', () => {
    expect(commandExists('node')).toBe(true);
  });

  it('commandExists returns false for nonexistent command', () => {
    expect(commandExists('this_command_does_not_exist_xyz_123')).toBe(false);
  });

  it('getNodeVersion returns a semver string', () => {
    const version = getNodeVersion();
    expect(version).not.toBeNull();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('getNodeMajorVersion returns at least 20', () => {
    const major = getNodeMajorVersion();
    expect(major).not.toBeNull();
    expect(major!).toBeGreaterThanOrEqual(20);
  });

  it('getServiceManager matches detected platform', () => {
    const platform = getPlatform();
    const result = getServiceManager();
    if (platform === 'macos') {
      expect(result).toBe('launchd');
    } else {
      expect(['systemd', 'none']).toContain(result);
    }
  });
});

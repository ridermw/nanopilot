import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module
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

vi.mock('./config.js', () => ({
  MOUNT_ALLOWLIST_PATH: '/mock/config/mount-allowlist.json',
}));

import fs from 'fs';
import { logger } from './logger.js';
import {
  loadMountAllowlist,
  validateMount,
  validateAdditionalMounts,
  generateAllowlistTemplate,
  _resetMountSecurityForTests,
} from './mount-security.js';

const mockedFs = vi.mocked(fs);

// Valid allowlist for testing
function validAllowlist(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    allowedRoots: [
      {
        path: '/home/user/projects',
        allowReadWrite: true,
        description: 'Projects',
      },
      {
        path: '/home/user/readonly',
        allowReadWrite: false,
        description: 'Read only',
      },
    ],
    blockedPatterns: ['custom-secret'],
    nonMainReadOnly: true,
    ...overrides,
  });
}

describe('mount-security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMountSecurityForTests();
  });

  describe('loadMountAllowlist', () => {
    it('returns null and warns when allowlist file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = loadMountAllowlist();

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/mock/config/mount-allowlist.json' }),
        expect.stringContaining('not found'),
      );
    });

    it('does not cache the missing-file case (allows retry)', () => {
      mockedFs.existsSync.mockReturnValue(false);

      loadMountAllowlist();
      // File "appears" on second call
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(validAllowlist());

      const result = loadMountAllowlist();
      expect(result).not.toBeNull();
      expect(result!.allowedRoots).toHaveLength(2);
    });

    it('returns null and logs error for invalid JSON', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('not json!!!');

      const result = loadMountAllowlist();

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
        expect.stringContaining('Failed to load'),
      );
    });

    it('caches the error permanently (does not spam logs)', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('bad json');

      loadMountAllowlist();
      loadMountAllowlist();
      loadMountAllowlist();

      // Only one error log despite 3 calls
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('rejects allowlist with non-array allowedRoots', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          allowedRoots: 'not-array',
          blockedPatterns: [],
          nonMainReadOnly: true,
        }),
      );

      const result = loadMountAllowlist();
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it('rejects allowlist with non-array blockedPatterns', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          allowedRoots: [],
          blockedPatterns: 'nope',
          nonMainReadOnly: true,
        }),
      );

      const result = loadMountAllowlist();
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it('rejects allowlist with non-boolean nonMainReadOnly', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({
          allowedRoots: [],
          blockedPatterns: [],
          nonMainReadOnly: 'yes',
        }),
      );

      const result = loadMountAllowlist();
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it('loads valid allowlist and merges DEFAULT_BLOCKED_PATTERNS', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(validAllowlist());

      const result = loadMountAllowlist();

      expect(result).not.toBeNull();
      expect(result!.allowedRoots).toHaveLength(2);
      // Should contain both default (.ssh, .env, etc.) and custom (custom-secret)
      expect(result!.blockedPatterns).toContain('.ssh');
      expect(result!.blockedPatterns).toContain('.env');
      expect(result!.blockedPatterns).toContain('custom-secret');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ allowedRoots: 2 }),
        expect.stringContaining('loaded successfully'),
      );
    });

    it('caches successful load and returns cached on subsequent calls', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(validAllowlist());

      const first = loadMountAllowlist();
      const second = loadMountAllowlist();

      expect(first).toBe(second); // same reference
      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1); // only read once
    });

    it('deduplicates blocked patterns when user list overlaps defaults', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(
        validAllowlist({ blockedPatterns: ['.ssh', '.env', 'custom-only'] }),
      );

      const result = loadMountAllowlist();
      expect(result).not.toBeNull();
      // .ssh and .env should appear only once each
      const sshCount = result!.blockedPatterns.filter(
        (p) => p === '.ssh',
      ).length;
      expect(sshCount).toBe(1);
      expect(result!.blockedPatterns).toContain('custom-only');
    });
  });

  describe('validateMount', () => {
    // Helper: set up a working allowlist for validateMount tests
    function setupAllowlist(overrides: Record<string, unknown> = {}) {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(validAllowlist(overrides));
      mockedFs.realpathSync.mockImplementation((p) => String(p));
    }

    it('blocks all mounts when no allowlist exists', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = validateMount({ hostPath: '/some/path' }, false);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No mount allowlist');
    });

    it('blocks mounts with path traversal (..) in container path', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/repo', containerPath: '../escape' },
        false,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('..');
    });

    it('blocks mounts with absolute container path', () => {
      setupAllowlist();

      const result = validateMount(
        {
          hostPath: '/home/user/projects/repo',
          containerPath: '/absolute/path',
        },
        false,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid container path');
    });

    it('falls back to hostPath basename when containerPath is empty string', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/repo', containerPath: '' },
        true,
      );

      // Empty string is falsy → defaults to path.basename('repo')
      expect(result.allowed).toBe(true);
      expect(result.resolvedContainerPath).toBe('repo');
    });

    it('blocks mounts with whitespace-only container path', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/repo', containerPath: '   ' },
        false,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid container path');
    });

    it('blocks mounts with colons in container path (Docker option injection)', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/repo', containerPath: 'repo:rw' },
        false,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid container path');
    });

    it('blocks mounts when host path does not exist', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(validAllowlist());
      mockedFs.realpathSync.mockImplementation((p) => {
        throw new Error('ENOENT');
      });

      const result = validateMount({ hostPath: '/nonexistent/path' }, false);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not exist');
    });

    it('blocks mounts matching default blocked patterns (.ssh)', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/.ssh/keys' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('.ssh');
    });

    it('blocks mounts matching default blocked patterns (.env)', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/app/.env' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('.env');
    });

    it('blocks mounts matching custom blocked patterns', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/custom-secret-file' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('custom-secret');
    });

    it('blocks mounts not under any allowed root', () => {
      setupAllowlist();

      const result = validateMount({ hostPath: '/opt/not-allowed/repo' }, true);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not under any allowed root');
    });

    it('allows mount under allowed root with read-write for main group', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/my-repo', readonly: false },
        true, // isMain
      );

      expect(result.allowed).toBe(true);
      expect(result.realHostPath).toBe('/home/user/projects/my-repo');
      expect(result.effectiveReadonly).toBe(false);
    });

    it('forces non-main group to readonly when nonMainReadOnly is true', () => {
      setupAllowlist(); // nonMainReadOnly: true

      const result = validateMount(
        { hostPath: '/home/user/projects/my-repo', readonly: false },
        false, // not main
      );

      expect(result.allowed).toBe(true);
      expect(result.effectiveReadonly).toBe(true); // forced readonly
    });

    it('allows non-main group read-write when nonMainReadOnly is false', () => {
      setupAllowlist({ nonMainReadOnly: false });

      const result = validateMount(
        { hostPath: '/home/user/projects/my-repo', readonly: false },
        false, // not main
      );

      expect(result.allowed).toBe(true);
      expect(result.effectiveReadonly).toBe(false); // allowed
    });

    it('forces readonly when root does not allow read-write', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/readonly/doc.txt', readonly: false },
        true, // main, but root has allowReadWrite: false
      );

      expect(result.allowed).toBe(true);
      expect(result.effectiveReadonly).toBe(true);
    });

    it('defaults to readonly when mount.readonly is not explicitly false', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/my-repo' },
        true,
      );

      expect(result.allowed).toBe(true);
      expect(result.effectiveReadonly).toBe(true);
    });

    it('defaults containerPath to basename of hostPath when not specified', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/my-repo' },
        true,
      );

      expect(result.allowed).toBe(true);
      expect(result.resolvedContainerPath).toBe('my-repo');
    });

    it('uses explicit containerPath when specified', () => {
      setupAllowlist();

      const result = validateMount(
        {
          hostPath: '/home/user/projects/my-repo',
          containerPath: 'custom-name',
        },
        true,
      );

      expect(result.allowed).toBe(true);
      expect(result.resolvedContainerPath).toBe('custom-name');
    });

    it('blocks id_rsa private key files', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/id_rsa' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('id_rsa');
    });

    it('blocks id_ed25519 key files', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/id_ed25519' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('id_ed25519');
    });

    it('blocks credentials directory', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/credentials' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('credentials');
    });

    it('blocks .docker directory', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/.docker' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('.docker');
    });

    it('blocks .aws directory', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/.aws' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('.aws');
    });

    it('blocks .kube directory', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/.kube' },
        true,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('.kube');
    });

    it('includes allowed root description in success reason', () => {
      setupAllowlist();

      const result = validateMount(
        { hostPath: '/home/user/projects/my-repo' },
        true,
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Projects');
    });

    it('skips allowed root if root path does not exist', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(validAllowlist());
      // realpathSync throws for root paths but succeeds for mount path
      mockedFs.realpathSync.mockImplementation((p) => {
        const ps = String(p);
        if (ps.includes('projects') || ps.includes('readonly')) {
          throw new Error('ENOENT');
        }
        return ps;
      });

      const result = validateMount(
        { hostPath: '/home/user/somewhere/repo' },
        true,
      );

      // Both allowed roots don't exist → path not under any root
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not under any allowed root');
    });
  });

  describe('validateAdditionalMounts', () => {
    function setupAllowlist() {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(validAllowlist());
      mockedFs.realpathSync.mockImplementation((p) => String(p));
    }

    it('returns empty array for empty input', () => {
      setupAllowlist();

      const result = validateAdditionalMounts([], 'test-group', false);
      expect(result).toEqual([]);
    });

    it('filters out rejected mounts and keeps valid ones', () => {
      setupAllowlist();

      const result = validateAdditionalMounts(
        [
          { hostPath: '/home/user/projects/valid-repo' },
          { hostPath: '/home/user/projects/.ssh/keys' }, // blocked
          { hostPath: '/home/user/projects/another-repo' },
        ],
        'test-group',
        true,
      );

      expect(result).toHaveLength(2);
      expect(result[0].hostPath).toBe('/home/user/projects/valid-repo');
      expect(result[1].hostPath).toBe('/home/user/projects/another-repo');
      // Rejected mount should be warned about
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: expect.stringContaining('.ssh') }),
        expect.stringContaining('REJECTED'),
      );
    });

    it('prefixes container paths with /workspace/extra/', () => {
      setupAllowlist();

      const result = validateAdditionalMounts(
        [{ hostPath: '/home/user/projects/repo', containerPath: 'my-project' }],
        'test-group',
        true,
      );

      expect(result).toHaveLength(1);
      expect(result[0].containerPath).toBe('/workspace/extra/my-project');
    });

    it('applies readonly for non-main groups', () => {
      setupAllowlist();

      const result = validateAdditionalMounts(
        [{ hostPath: '/home/user/projects/repo', readonly: false }],
        'non-main-group',
        false, // not main
      );

      expect(result).toHaveLength(1);
      expect(result[0].readonly).toBe(true); // forced
    });

    it('logs debug for each validated mount', () => {
      setupAllowlist();

      validateAdditionalMounts(
        [{ hostPath: '/home/user/projects/repo' }],
        'my-group',
        true,
      );

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'my-group' }),
        expect.stringContaining('validated successfully'),
      );
    });

    it('returns all mounts as rejected when no allowlist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = validateAdditionalMounts(
        [{ hostPath: '/some/path1' }, { hostPath: '/some/path2' }],
        'test-group',
        true,
      );

      expect(result).toHaveLength(0);
      // Each mount triggers: loadMountAllowlist warn + validateAdditionalMounts warn
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining('No mount allowlist'),
        }),
        expect.stringContaining('REJECTED'),
      );
    });
  });

  describe('generateAllowlistTemplate', () => {
    it('returns valid JSON with expected structure', () => {
      const template = generateAllowlistTemplate();
      const parsed = JSON.parse(template);

      expect(parsed.allowedRoots).toBeInstanceOf(Array);
      expect(parsed.allowedRoots.length).toBeGreaterThan(0);
      expect(parsed.blockedPatterns).toBeInstanceOf(Array);
      expect(typeof parsed.nonMainReadOnly).toBe('boolean');
    });

    it('includes example allowed roots with descriptions', () => {
      const parsed = JSON.parse(generateAllowlistTemplate());
      const root = parsed.allowedRoots[0];

      expect(root).toHaveProperty('path');
      expect(root).toHaveProperty('allowReadWrite');
      expect(root).toHaveProperty('description');
    });

    it('includes both read-write and read-only examples', () => {
      const parsed = JSON.parse(generateAllowlistTemplate());

      const rwRoot = parsed.allowedRoots.find(
        (r: any) => r.allowReadWrite === true,
      );
      const roRoot = parsed.allowedRoots.find(
        (r: any) => r.allowReadWrite === false,
      );

      expect(rwRoot).toBeDefined();
      expect(roRoot).toBeDefined();
    });

    it('nonMainReadOnly defaults to true in template', () => {
      const parsed = JSON.parse(generateAllowlistTemplate());
      expect(parsed.nonMainReadOnly).toBe(true);
    });
  });
});

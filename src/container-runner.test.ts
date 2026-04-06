import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Sentinel markers must match container-runner.ts
const OUTPUT_START_MARKER = '---NANOPILOT_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOPILOT_OUTPUT_END---';

// Mock config
vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanopilot-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 1024,
  CONTAINER_TIMEOUT: 1800000, // 30min
  CREDENTIAL_PROXY_PORT: 3001,
  DATA_DIR: '/tmp/nanopilot-test-data',
  GROUPS_DIR: '/tmp/nanopilot-test-groups',
  IDLE_TIMEOUT: 1800000, // 30min
  COPILOT_MODEL: 'gpt-4.1',
  TIMEZONE: 'America/Los_Angeles',
}));

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false })),
      copyFileSync: vi.fn(),
      cpSync: vi.fn(),
    },
  };
});

// Mock mount-security
vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

// Mock group-folder
vi.mock('./group-folder.js', () => ({
  resolveGroupFolderPath: vi.fn(
    (f: string) => `/tmp/nanopilot-test-groups/${f}`,
  ),
  resolveGroupIpcPath: vi.fn(
    (f: string) => `/tmp/nanopilot-test-groups/${f}/ipc`,
  ),
}));

// Mock container-runtime
vi.mock('./container-runtime.js', () => ({
  CONTAINER_RUNTIME_BIN: 'container',
  CONTAINER_HOST_GATEWAY: 'host.docker.internal',
  hostGatewayArgs: () => [],
  readonlyMountArgs: (h: string, c: string) => ['-v', `${h}:${c}:ro`],
  stopContainer: vi.fn(),
}));

// Mock credential-proxy
vi.mock('./credential-proxy.js', () => ({
  detectAuthMode: vi.fn(() => 'api-key'),
}));

// Create a controllable fake ChildProcess
function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

// Mock child_process.spawn
vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(() => fakeProc),
    exec: vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        return new EventEmitter();
      },
    ),
  };
});

import {
  runContainerAgent,
  writeTasksSnapshot,
  writeGroupsSnapshot,
  ContainerOutput,
} from './container-runner.js';
import fs from 'fs';
import path from 'path';
import type { RegisteredGroup } from './types.js';
import { validateAdditionalMounts } from './mount-security.js';
import { stopContainer } from './container-runtime.js';

const testGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@Andy',
  added_at: new Date().toISOString(),
};

const testInput = {
  prompt: 'Hello',
  groupFolder: 'test-group',
  chatJid: 'test@g.us',
  isMain: false,
};

function emitOutputMarker(
  proc: ReturnType<typeof createFakeProcess>,
  output: ContainerOutput,
) {
  const json = JSON.stringify(output);
  proc.stdout.push(`${OUTPUT_START_MARKER}\n${json}\n${OUTPUT_END_MARKER}\n`);
}

describe('container-runner timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('token is NOT passed as Docker env var', async () => {
    const { spawn } = await import('child_process');
    const resultPromise = runContainerAgent(
      testGroup,
      { ...testInput, githubToken: 'gho_secret_token_xyz' },
      () => {},
    );

    // Check spawn args don't contain COPILOT_GITHUB_TOKEN
    const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    const dockerArgs: string[] = spawnArgs[1];
    const tokenEnvArg = dockerArgs.find((arg: string) =>
      arg.includes('COPILOT_GITHUB_TOKEN='),
    );
    expect(tokenEnvArg).toBeUndefined();

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('token is passed via stdin in ContainerInput JSON', async () => {
    const stdinChunks: string[] = [];
    fakeProc.stdin.on('data', (chunk: Buffer) => {
      stdinChunks.push(chunk.toString());
    });

    const resultPromise = runContainerAgent(
      testGroup,
      { ...testInput, githubToken: 'gho_secret_token_xyz' },
      () => {},
    );

    // stdin receives the full ContainerInput JSON including the token
    const stdinData = stdinChunks.join('');
    const parsed = JSON.parse(stdinData);
    expect(parsed.githubToken).toBe('gho_secret_token_xyz');

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('timeout after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output with a result
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Here is my response',
      newSessionId: 'session-123',
    });

    // Let output processing settle
    await vi.advanceTimersByTimeAsync(10);

    // Fire the hard timeout (IDLE_TIMEOUT + 30s = 1830000ms)
    await vi.advanceTimersByTimeAsync(1830000);

    // Emit close event (as if container was stopped by the timeout)
    fakeProc.emit('close', 137);

    // Let the promise resolve
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-123');
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'Here is my response' }),
    );
  });

  it('timeout with no output resolves as error', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // No output emitted — fire the hard timeout
    await vi.advanceTimersByTimeAsync(1830000);

    // Emit close event
    fakeProc.emit('close', 137);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('normal exit after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
      newSessionId: 'session-456',
    });

    await vi.advanceTimersByTimeAsync(10);

    // Normal exit (no timeout)
    fakeProc.emit('close', 0);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-456');
  });

  it('non-zero exit code with no output resolves as error', async () => {
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    // Process exits with error code, no output markers
    fakeProc.emit('close', 1);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toBeTruthy();
  });

  it('handles malformed JSON in streamed output markers', async () => {
    const { logger } = await import('./logger.js');
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Push malformed marker
    fakeProc.stdout.push(
      `${OUTPUT_START_MARKER}\nnot-valid-json\n${OUTPUT_END_MARKER}\n`,
    );
    await vi.advanceTimersByTimeAsync(10);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() }),
      expect.stringContaining('Failed to parse'),
    );

    // Close normally
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('multiple streamed outputs are all forwarded', async () => {
    const outputs: ContainerOutput[] = [];
    const onOutput = vi.fn(async (o: ContainerOutput) => {
      outputs.push(o);
    });
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // First output
    emitOutputMarker(fakeProc, { status: 'success', result: 'Part 1' });
    await vi.advanceTimersByTimeAsync(10);

    // Second output
    emitOutputMarker(fakeProc, { status: 'success', result: 'Part 2' });
    await vi.advanceTimersByTimeAsync(10);

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    await resultPromise;
    expect(outputs).toHaveLength(2);
    expect(outputs[0].result).toBe('Part 1');
    expect(outputs[1].result).toBe('Part 2');
  });

  it('stderr is logged at debug level', async () => {
    const { logger } = await import('./logger.js');
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    fakeProc.stderr.push('Some debug output from SDK\n');
    await vi.advanceTimersByTimeAsync(10);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ container: testGroup.folder }),
      expect.stringContaining('Some debug output'),
    );

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('calls onProcess callback with the child process', async () => {
    const onProcess = vi.fn();
    const resultPromise = runContainerAgent(testGroup, testInput, onProcess);

    expect(onProcess).toHaveBeenCalledWith(
      fakeProc,
      expect.stringContaining('nanopilot-test-group-'),
    );

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('container name sanitizes special characters', async () => {
    const { spawn } = await import('child_process');
    // Create fresh process for this special group
    fakeProc = createFakeProcess();
    const specialGroup: RegisteredGroup = {
      name: 'Special/Group',
      folder: 'special.chars@folder',
      trigger: '@Bot',
      added_at: new Date().toISOString(),
    };

    const resultPromise = runContainerAgent(
      specialGroup,
      { ...testInput, groupFolder: specialGroup.folder },
      () => {},
    );

    const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = spawnArgs[spawnArgs.length - 1];
    const nameIdx = lastCall[1].indexOf('--name');
    const containerName = lastCall[1][nameIdx + 1];
    // Special chars replaced with dashes
    expect(containerName).not.toMatch(/[.@/]/);
    expect(containerName).toContain('nanopilot-special-chars-folder');

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });
});

describe('writeTasksSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes all tasks for main group', () => {
    const mockFs = vi.mocked(fs);
    const tasks = [
      {
        id: '1',
        groupFolder: 'g1',
        prompt: 'T1',
        schedule_type: 'once',
        schedule_value: 'v',
        status: 'active',
        next_run: null,
      },
      {
        id: '2',
        groupFolder: 'g2',
        prompt: 'T2',
        schedule_type: 'once',
        schedule_value: 'v',
        status: 'active',
        next_run: null,
      },
    ];

    writeTasksSnapshot('g1', true, tasks);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('current_tasks.json'),
      expect.any(String),
    );
    // Main sees both tasks
    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
    expect(written).toHaveLength(2);
  });

  it('filters tasks for non-main group', () => {
    const mockFs = vi.mocked(fs);
    const tasks = [
      {
        id: '1',
        groupFolder: 'g1',
        prompt: 'T1',
        schedule_type: 'once',
        schedule_value: 'v',
        status: 'active',
        next_run: null,
      },
      {
        id: '2',
        groupFolder: 'g2',
        prompt: 'T2',
        schedule_type: 'once',
        schedule_value: 'v',
        status: 'active',
        next_run: null,
      },
    ];

    writeTasksSnapshot('g1', false, tasks);

    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe('1');
  });
});

describe('writeGroupsSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes all groups for main', () => {
    const mockFs = vi.mocked(fs);
    const groups = [
      { jid: 'j1', name: 'G1', lastActivity: '2024-01-01', isRegistered: true },
      {
        jid: 'j2',
        name: 'G2',
        lastActivity: '2024-01-01',
        isRegistered: false,
      },
    ];

    writeGroupsSnapshot('g1', true, groups, new Set(['j1']));

    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
    expect(written.groups).toHaveLength(2);
  });

  it('writes empty groups for non-main', () => {
    const mockFs = vi.mocked(fs);
    const groups = [
      { jid: 'j1', name: 'G1', lastActivity: '2024-01-01', isRegistered: true },
    ];

    writeGroupsSnapshot('g1', false, groups, new Set(['j1']));

    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
    expect(written.groups).toHaveLength(0);
  });
});

describe('buildVolumeMounts (via spawn args)', () => {
  let mockFs: typeof fs;
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
    vi.clearAllMocks();
    mockFs = vi.mocked(fs);
    const cp = await import('child_process');
    spawnMock = cp.spawn as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Extract all -v volume mount values from the last spawn call */
  function getVolumeMounts(): string[] {
    const calls = spawnMock.mock.calls;
    const args: string[] = calls[calls.length - 1][1];
    const mounts: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-v') mounts.push(args[i + 1]);
    }
    return mounts;
  }

  /** Mock existsSync to return true only for paths matching given substrings */
  function mockExistsSync(truePatterns: string[]) {
    (mockFs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
      (p: string) => truePatterns.some((pat) => String(p).includes(pat)),
    );
  }

  /** Run runContainerAgent and immediately close the process */
  async function runAndClose(
    group: RegisteredGroup,
    overrides: Record<string, unknown> = {},
  ) {
    const input = { ...testInput, ...overrides };
    const p = runContainerAgent(group, input as any, () => {});
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    return p;
  }

  it('main group mounts project root read-only', async () => {
    mockExistsSync([]);
    await runAndClose(testGroup, { isMain: true });
    const mounts = getVolumeMounts();
    expect(mounts).toContainEqual(`${process.cwd()}:/workspace/project:ro`);
  });

  it('main group mounts store writable', async () => {
    mockExistsSync([]);
    await runAndClose(testGroup, { isMain: true });
    const mounts = getVolumeMounts();
    expect(mounts).toContainEqual(
      `${path.join(process.cwd(), 'store')}:/workspace/project/store`,
    );
  });

  it('main group shadow-mounts .env when it exists', async () => {
    mockExistsSync(['.env']);
    await runAndClose(testGroup, { isMain: true });
    const mounts = getVolumeMounts();
    expect(mounts).toContainEqual('/dev/null:/workspace/project/.env:ro');
  });

  it('main group does not shadow-mount .env when it does not exist', async () => {
    mockExistsSync([]);
    await runAndClose(testGroup, { isMain: true });
    const mounts = getVolumeMounts();
    expect(mounts.find((m) => m.includes('/dev/null'))).toBeUndefined();
  });

  it('non-main group does not get project root or store', async () => {
    mockExistsSync([]);
    await runAndClose(testGroup, { isMain: false });
    const mounts = getVolumeMounts();
    expect(
      mounts.find((m) => m.includes('/workspace/project')),
    ).toBeUndefined();
  });

  it('non-main group mounts global/ read-only when it exists', async () => {
    mockExistsSync(['global']);
    await runAndClose(testGroup, { isMain: false });
    const mounts = getVolumeMounts();
    expect(mounts).toContainEqual(
      expect.stringContaining('global:/workspace/global:ro'),
    );
  });

  it('non-main group does not mount global/ when dir does not exist', async () => {
    mockExistsSync([]);
    await runAndClose(testGroup, { isMain: false });
    const mounts = getVolumeMounts();
    expect(mounts.find((m) => m.includes('/workspace/global'))).toBeUndefined();
  });

  it('copies skill directories from container/skills/', async () => {
    mockExistsSync(['container/skills']);
    (mockFs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
      'browser-skill',
      'status-skill',
    ]);
    (mockFs.statSync as ReturnType<typeof vi.fn>).mockImplementation(
      (p: string) => ({
        isDirectory: () => String(p).includes('container/skills/'),
        mtimeMs: 0,
      }),
    );
    await runAndClose(testGroup);
    expect(mockFs.cpSync).toHaveBeenCalledTimes(2);
  });

  it('skips non-directory entries in skills/', async () => {
    mockExistsSync(['container/skills']);
    (mockFs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
      'browser-skill',
      'README.md',
    ]);
    (mockFs.statSync as ReturnType<typeof vi.fn>).mockImplementation(
      (p: string) => ({
        isDirectory: () => String(p).endsWith('browser-skill'),
        mtimeMs: 0,
      }),
    );
    await runAndClose(testGroup);
    const skillCopies = (
      mockFs.cpSync as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('browser-skill'),
    );
    expect(skillCopies).toHaveLength(1);
  });

  it('creates IPC directories for messages, tasks, and input', async () => {
    mockExistsSync([]);
    await runAndClose(testGroup);
    const mkdirPaths = (
      mockFs.mkdirSync as ReturnType<typeof vi.fn>
    ).mock.calls.map((c: unknown[]) => String(c[0]));
    const ipcBase = '/tmp/nanopilot-test-groups/test-group/ipc';
    expect(mkdirPaths).toContain(`${ipcBase}/messages`);
    expect(mkdirPaths).toContain(`${ipcBase}/tasks`);
    expect(mkdirPaths).toContain(`${ipcBase}/input`);
  });

  it('copies agent-runner when destination does not exist', async () => {
    mockExistsSync(['container/agent-runner/src']);
    await runAndClose(testGroup);
    const cpCalls = (mockFs.cpSync as ReturnType<typeof vi.fn>).mock.calls;
    const arCopy = cpCalls.find((c: unknown[]) =>
      String(c[0]).includes('agent-runner'),
    );
    expect(arCopy).toBeDefined();
  });

  it('does not copy agent-runner when cache is current', async () => {
    (mockFs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(
      (p: string) => {
        const s = String(p);
        return (
          s.includes('container/agent-runner/src') ||
          s.includes('agent-runner-src')
        );
      },
    );
    (mockFs.statSync as ReturnType<typeof vi.fn>).mockImplementation(
      (p: string) => {
        const s = String(p);
        // Source is older (100) than cache (200) → no copy needed
        if (s.includes('container/agent-runner/src'))
          return { isDirectory: () => false, mtimeMs: 100 };
        if (s.includes('agent-runner-src'))
          return { isDirectory: () => false, mtimeMs: 200 };
        return { isDirectory: () => false, mtimeMs: 0 };
      },
    );
    await runAndClose(testGroup);
    const cpCalls = (mockFs.cpSync as ReturnType<typeof vi.fn>).mock.calls;
    const arCopy = cpCalls.find((c: unknown[]) =>
      String(c[0]).includes('agent-runner'),
    );
    expect(arCopy).toBeUndefined();
  });

  it('filters .test.ts files during agent-runner copy', async () => {
    mockExistsSync(['container/agent-runner/src']);
    await runAndClose(testGroup);
    const cpCalls = (mockFs.cpSync as ReturnType<typeof vi.fn>).mock.calls;
    const arCopy = cpCalls.find((c: unknown[]) =>
      String(c[0]).includes('agent-runner'),
    );
    expect(arCopy).toBeDefined();
    const opts = arCopy![2] as { filter: (src: string) => boolean };
    expect(opts.filter('src/index.ts')).toBe(true);
    expect(opts.filter('src/index.test.ts')).toBe(false);
    expect(opts.filter('src/helpers.test.ts')).toBe(false);
  });

  it('calls validateAdditionalMounts when containerConfig has mounts', async () => {
    mockExistsSync([]);
    const groupWithMounts: RegisteredGroup = {
      ...testGroup,
      containerConfig: {
        additionalMounts: [
          { hostPath: '/data/shared', containerPath: 'shared', readonly: true },
        ],
      },
    };
    await runAndClose(groupWithMounts);
    expect(validateAdditionalMounts).toHaveBeenCalledWith(
      groupWithMounts.containerConfig!.additionalMounts,
      groupWithMounts.name,
      false,
    );
  });
});

describe('spawn output and error paths', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
    vi.clearAllMocks();
    vi.mocked(fs).existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('truncates stdout when exceeding CONTAINER_MAX_OUTPUT_SIZE', async () => {
    const { logger } = await import('./logger.js');
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    fakeProc.stdout.push(Buffer.from('x'.repeat(1100)));
    await vi.advanceTimersByTimeAsync(10);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ group: testGroup.name }),
      expect.stringContaining('stdout truncated'),
    );

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('truncates stderr when exceeding CONTAINER_MAX_OUTPUT_SIZE', async () => {
    const { logger } = await import('./logger.js');
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    fakeProc.stderr.push(Buffer.from('e'.repeat(1100)));
    await vi.advanceTimersByTimeAsync(10);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ group: testGroup.name }),
      expect.stringContaining('stderr truncated'),
    );

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('falls back to SIGKILL when stopContainer fails on timeout', async () => {
    vi.mocked(stopContainer).mockImplementation(() => {
      throw new Error('stop failed');
    });
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    await vi.advanceTimersByTimeAsync(1830000);
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGKILL');

    fakeProc.emit('close', 137);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('non-zero exit includes last 200 chars of stderr in error', async () => {
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    const longStderr = 'A'.repeat(100) + 'B'.repeat(200);
    fakeProc.stderr.push(Buffer.from(longStderr));
    await vi.advanceTimersByTimeAsync(10);

    fakeProc.emit('close', 1);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('B'.repeat(200));
    expect(result.error).not.toContain('A'.repeat(100));
  });

  it('spawn error event resolves as error', async () => {
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    fakeProc.emit('error', new Error('spawn ENOENT'));
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('spawn ENOENT');
  });

  it('legacy mode parses output from accumulated stdout', async () => {
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    const output = JSON.stringify({
      status: 'success',
      result: 'Legacy result',
      newSessionId: 'sess-legacy',
    });
    fakeProc.stdout.push(
      Buffer.from(
        `debug line\n${OUTPUT_START_MARKER}\n${output}\n${OUTPUT_END_MARKER}\n`,
      ),
    );
    await vi.advanceTimersByTimeAsync(10);

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.result).toBe('Legacy result');
    expect(result.newSessionId).toBe('sess-legacy');
  });

  it('streaming output resets timeout timer', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Advance to just before timeout
    await vi.advanceTimersByTimeAsync(1829000);

    // Emit output — should reset timeout
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Reset',
      newSessionId: 'sess-reset',
    });
    await vi.advanceTimersByTimeAsync(10);

    // Advance again — should NOT have timed out (timer was reset)
    await vi.advanceTimersByTimeAsync(1829000);

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
  });
});

describe('log writing paths', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
    vi.clearAllMocks();
    vi.mocked(fs).existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.LOG_LEVEL;
  });

  it('verbose mode (LOG_LEVEL=debug) includes full input in log file', async () => {
    process.env.LOG_LEVEL = 'debug';
    const mockFs = vi.mocked(fs);
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;

    const writeCall = mockFs.writeFileSync.mock.calls.find((c) =>
      String(c[0]).includes('container-'),
    );
    expect(writeCall).toBeDefined();
    const logContent = String(writeCall![1]);
    expect(logContent).toContain('=== Input ===');
    expect(logContent).toContain('"prompt"');
  });

  it('non-verbose error includes input summary not full input', async () => {
    delete process.env.LOG_LEVEL;
    const mockFs = vi.mocked(fs);
    const resultPromise = runContainerAgent(testGroup, testInput, () => {});

    fakeProc.emit('close', 1);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;

    const writeCall = mockFs.writeFileSync.mock.calls.find((c) =>
      String(c[0]).includes('container-'),
    );
    expect(writeCall).toBeDefined();
    const logContent = String(writeCall![1]);
    expect(logContent).toContain('=== Input Summary ===');
    expect(logContent).toContain('Prompt length:');
    expect(logContent).toContain('=== Stderr');
  });
});

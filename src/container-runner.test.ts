import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Sentinel markers must match container-runner.ts
const OUTPUT_START_MARKER = '---NANOPILOT_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOPILOT_OUTPUT_END---';

// Mock config
vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanopilot-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 1800000, // 30min
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
  CONTAINER_RUNTIME_BIN: 'docker',
  hostGatewayArgs: () => [],
  readonlyMountArgs: (h: string, c: string) => ['-v', `${h}:${c}:ro`],
  stopContainer: vi.fn(),
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
import type { RegisteredGroup } from './types.js';

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
    expect(containerName).not.toMatch(/[.@\/]/);
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

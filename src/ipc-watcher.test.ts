/**
 * Tests for startIpcWatcher (ipc.ts lines 34–159).
 *
 * Uses vi.useFakeTimers() to control the polling setTimeout and path-keyed
 * fs mocks so each call resolves based on its path argument.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs');
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('./config.js', () => ({
  DATA_DIR: '/mock/data',
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'UTC',
}));
vi.mock('./db.js', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock('./group-folder.js', () => ({
  isValidGroupFolder: vi.fn(() => true),
}));

import fs from 'fs';
import { startIpcWatcher, _resetIpcWatcherForTests, IpcDeps } from './ipc.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

const mockedFs = vi.mocked(fs);

// ── Helpers ───────────────────────────────────────────────────────────

const IPC_BASE = '/mock/data/ipc';

const MAIN_GROUP: RegisteredGroup = {
  name: 'Main',
  folder: 'whatsapp_main',
  trigger: 'always',
  added_at: '2024-01-01T00:00:00.000Z',
  isMain: true,
};

const OTHER_GROUP: RegisteredGroup = {
  name: 'Other',
  folder: 'other-group',
  trigger: '@Andy',
  added_at: '2024-01-01T00:00:00.000Z',
};

function makeDeps(overrides?: Partial<IpcDeps>): IpcDeps {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    registeredGroups: vi.fn(() => ({
      'main@g.us': MAIN_GROUP,
      'other@g.us': OTHER_GROUP,
    })),
    registerGroup: vi.fn(),
    syncGroups: vi.fn().mockResolvedValue(undefined),
    getAvailableGroups: vi.fn(() => []),
    writeGroupsSnapshot: vi.fn(),
    onTasksChanged: vi.fn(),
    ...overrides,
  };
}

/**
 * Set up path-keyed fs stubs for a single poll cycle.
 * @param dirs  - group folder names returned by readdirSync(ipcBaseDir)
 * @param files - map of absolute dir → file names returned by readdirSync
 * @param contents - map of absolute file path → file content string
 * @param existingDirs - set of dirs that existsSync returns true for
 */
function stubFs(opts: {
  dirs?: string[];
  files?: Record<string, string[]>;
  contents?: Record<string, string>;
  existingDirs?: Set<string>;
}) {
  const {
    dirs = [],
    files = {},
    contents = {},
    existingDirs = new Set(),
  } = opts;

  mockedFs.mkdirSync.mockReturnValue(undefined as any);

  mockedFs.readdirSync.mockImplementation(((p: string) => {
    if (p === IPC_BASE) return dirs as any;
    if (files[p]) return files[p] as any;
    throw Object.assign(
      new Error(`ENOENT: no such file or directory, scandir '${p}'`),
      { code: 'ENOENT' },
    );
  }) as any);

  mockedFs.statSync.mockImplementation(((p: string) => ({
    isDirectory: () => true,
  })) as any);

  mockedFs.existsSync.mockImplementation(((p: string) =>
    existingDirs.has(p)) as any);

  mockedFs.readFileSync.mockImplementation(((p: string) => {
    if (contents[p] !== undefined) return contents[p];
    throw Object.assign(
      new Error(`ENOENT: no such file or directory, open '${p}'`),
      { code: 'ENOENT' },
    );
  }) as any);

  mockedFs.unlinkSync.mockReturnValue(undefined);
  mockedFs.renameSync.mockReturnValue(undefined);
}

// ── Setup / teardown ──────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  _resetIpcWatcherForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('startIpcWatcher', () => {
  // 1. Already-running guard
  it('logs and returns when called twice (duplicate-start guard)', async () => {
    stubFs({ dirs: [] });
    const deps = makeDeps();

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    vi.mocked(logger.debug).mockClear();

    startIpcWatcher(deps);
    expect(logger.debug).toHaveBeenCalledWith(
      'IPC watcher already running, skipping duplicate start',
    );
  });

  // 2. Base dir created
  it('creates the ipc base directory on start', async () => {
    stubFs({ dirs: [] });
    const deps = makeDeps();

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(IPC_BASE, {
      recursive: true,
    });
  });

  // 3. Base dir read error
  it('logs error and reschedules when readdirSync on base dir throws', async () => {
    mockedFs.mkdirSync.mockReturnValue(undefined as any);
    mockedFs.readdirSync.mockImplementation(() => {
      throw new Error('disk error');
    });

    const deps = makeDeps();

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Error reading IPC base directory',
    );
    // Verify setTimeout was called to reschedule
    await vi.advanceTimersByTimeAsync(1000);
    // Second invocation also hits the error (readdirSync still throws)
    expect(vi.mocked(logger.error).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // 4. Empty directory
  it('reschedules without processing when no group folders exist', async () => {
    stubFs({ dirs: [] });
    const deps = makeDeps();

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.sendMessage).not.toHaveBeenCalled();
    // After IPC_POLL_INTERVAL, another cycle should run
    await vi.advanceTimersByTimeAsync(1000);
    // readdirSync called again for the second cycle
    expect(mockedFs.readdirSync).toHaveBeenCalledTimes(2);
  });

  // 5. Message file: authorized main group send
  it('sends message and unlinks file for authorized main group', async () => {
    const msgPath = `${IPC_BASE}/whatsapp_main/messages/msg1.json`;
    const msgContent = JSON.stringify({
      type: 'message',
      chatJid: 'other@g.us',
      text: 'hello from main',
    });

    stubFs({
      dirs: ['whatsapp_main'],
      files: { [`${IPC_BASE}/whatsapp_main/messages`]: ['msg1.json'] },
      contents: { [msgPath]: msgContent },
      existingDirs: new Set([`${IPC_BASE}/whatsapp_main/messages`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.sendMessage).toHaveBeenCalledWith(
      'other@g.us',
      'hello from main',
    );
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(msgPath);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        chatJid: 'other@g.us',
        sourceGroup: 'whatsapp_main',
      }),
      'IPC message sent',
    );
  });

  // 6. Message file: authorized self-group send
  it('sends message when non-main group sends to its own JID', async () => {
    const msgPath = `${IPC_BASE}/other-group/messages/self.json`;
    const msgContent = JSON.stringify({
      type: 'message',
      chatJid: 'other@g.us',
      text: 'self-send',
    });

    stubFs({
      dirs: ['other-group'],
      files: { [`${IPC_BASE}/other-group/messages`]: ['self.json'] },
      contents: { [msgPath]: msgContent },
      existingDirs: new Set([`${IPC_BASE}/other-group/messages`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.sendMessage).toHaveBeenCalledWith('other@g.us', 'self-send');
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(msgPath);
  });

  // 7. Message file: unauthorized send blocked
  it('blocks message when non-main group sends to different JID', async () => {
    const msgPath = `${IPC_BASE}/other-group/messages/unauth.json`;
    const msgContent = JSON.stringify({
      type: 'message',
      chatJid: 'main@g.us',
      text: 'sneaky',
    });

    stubFs({
      dirs: ['other-group'],
      files: { [`${IPC_BASE}/other-group/messages`]: ['unauth.json'] },
      contents: { [msgPath]: msgContent },
      existingDirs: new Set([`${IPC_BASE}/other-group/messages`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        chatJid: 'main@g.us',
        sourceGroup: 'other-group',
      }),
      'Unauthorized IPC message attempt blocked',
    );
    // File is still unlinked even for unauthorized messages
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(msgPath);
  });

  // 8. Message file: invalid data (missing fields)
  it('unlinks file without sending when message JSON lacks required fields', async () => {
    const msgPath = `${IPC_BASE}/whatsapp_main/messages/bad.json`;
    const msgContent = JSON.stringify({ type: 'message' }); // missing chatJid and text

    stubFs({
      dirs: ['whatsapp_main'],
      files: { [`${IPC_BASE}/whatsapp_main/messages`]: ['bad.json'] },
      contents: { [msgPath]: msgContent },
      existingDirs: new Set([`${IPC_BASE}/whatsapp_main/messages`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(msgPath);
  });

  // 9. Corrupt message JSON → moved to errors/
  it('moves corrupt message JSON to errors/ directory', async () => {
    const msgPath = `${IPC_BASE}/whatsapp_main/messages/corrupt.json`;

    stubFs({
      dirs: ['whatsapp_main'],
      files: { [`${IPC_BASE}/whatsapp_main/messages`]: ['corrupt.json'] },
      contents: { [msgPath]: '{not valid json!!!' },
      existingDirs: new Set([`${IPC_BASE}/whatsapp_main/messages`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        file: 'corrupt.json',
        sourceGroup: 'whatsapp_main',
      }),
      'Error processing IPC message',
    );
    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(`${IPC_BASE}/errors`, {
      recursive: true,
    });
    expect(mockedFs.renameSync).toHaveBeenCalledWith(
      msgPath,
      `${IPC_BASE}/errors/whatsapp_main-corrupt.json`,
    );
  });

  // 10. Task file: valid task processed and unlinked
  it('processes valid task file and unlinks it', async () => {
    const taskPath = `${IPC_BASE}/whatsapp_main/tasks/task1.json`;
    const taskContent = JSON.stringify({
      type: 'schedule_task',
      prompt: 'do work',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00',
      targetJid: 'other@g.us',
    });

    stubFs({
      dirs: ['whatsapp_main'],
      files: { [`${IPC_BASE}/whatsapp_main/tasks`]: ['task1.json'] },
      contents: { [taskPath]: taskContent },
      existingDirs: new Set([`${IPC_BASE}/whatsapp_main/tasks`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    // processTaskIpc was called internally — verify the file was processed and unlinked
    const { createTask } = await import('./db.js');
    expect(vi.mocked(createTask)).toHaveBeenCalled();
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(taskPath);
  });

  // 11. Corrupt task JSON → moved to errors/
  it('moves corrupt task JSON to errors/ directory', async () => {
    const taskPath = `${IPC_BASE}/whatsapp_main/tasks/bad-task.json`;

    stubFs({
      dirs: ['whatsapp_main'],
      files: { [`${IPC_BASE}/whatsapp_main/tasks`]: ['bad-task.json'] },
      contents: { [taskPath]: '<<<invalid>>>' },
      existingDirs: new Set([`${IPC_BASE}/whatsapp_main/tasks`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        file: 'bad-task.json',
        sourceGroup: 'whatsapp_main',
      }),
      'Error processing IPC task',
    );
    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(`${IPC_BASE}/errors`, {
      recursive: true,
    });
    expect(mockedFs.renameSync).toHaveBeenCalledWith(
      taskPath,
      `${IPC_BASE}/errors/whatsapp_main-bad-task.json`,
    );
  });

  // 12. Messages dir doesn't exist → skipped without error
  it('skips messages processing when messages dir does not exist', async () => {
    const taskPath = `${IPC_BASE}/whatsapp_main/tasks/task1.json`;
    const taskContent = JSON.stringify({
      type: 'schedule_task',
      prompt: 'still works',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00',
      targetJid: 'other@g.us',
    });

    stubFs({
      dirs: ['whatsapp_main'],
      files: { [`${IPC_BASE}/whatsapp_main/tasks`]: ['task1.json'] },
      contents: { [taskPath]: taskContent },
      // messages dir missing — only tasks dir exists
      existingDirs: new Set([`${IPC_BASE}/whatsapp_main/tasks`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    // No error about messages directory
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'Error reading IPC messages directory',
    );
    // Tasks still processed
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(taskPath);
  });

  // 13. Tasks dir doesn't exist → skipped without error
  it('skips tasks processing when tasks dir does not exist', async () => {
    const msgPath = `${IPC_BASE}/whatsapp_main/messages/msg1.json`;
    const msgContent = JSON.stringify({
      type: 'message',
      chatJid: 'other@g.us',
      text: 'just a message',
    });

    stubFs({
      dirs: ['whatsapp_main'],
      files: { [`${IPC_BASE}/whatsapp_main/messages`]: ['msg1.json'] },
      contents: { [msgPath]: msgContent },
      // tasks dir missing — only messages dir exists
      existingDirs: new Set([`${IPC_BASE}/whatsapp_main/messages`]),
    });

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    // Message still sent
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'other@g.us',
      'just a message',
    );
    // No error about tasks directory
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'Error reading IPC tasks directory',
    );
  });

  // 14. Messages dir read error → logger.error, continues to tasks
  it('logs error and continues to tasks when messages dir read fails', async () => {
    const taskPath = `${IPC_BASE}/whatsapp_main/tasks/task1.json`;
    const taskContent = JSON.stringify({
      type: 'schedule_task',
      prompt: 'after msg error',
      schedule_type: 'once',
      schedule_value: '2025-06-01T00:00:00',
      targetJid: 'other@g.us',
    });

    const messagesDir = `${IPC_BASE}/whatsapp_main/messages`;
    const tasksDir = `${IPC_BASE}/whatsapp_main/tasks`;

    mockedFs.mkdirSync.mockReturnValue(undefined as any);

    mockedFs.readdirSync.mockImplementation(((p: string) => {
      if (p === IPC_BASE) return ['whatsapp_main'] as any;
      if (p === messagesDir) throw new Error('permission denied');
      if (p === tasksDir) return ['task1.json'] as any;
      return [] as any;
    }) as any);

    mockedFs.statSync.mockImplementation((() => ({
      isDirectory: () => true,
    })) as any);

    // existsSync: messages dir exists (but read will fail), tasks dir exists
    mockedFs.existsSync.mockImplementation(
      ((p: string) => p === messagesDir || p === tasksDir) as any,
    );

    mockedFs.readFileSync.mockImplementation(((p: string) => {
      if (p === taskPath) return taskContent;
      throw new Error('ENOENT');
    }) as any);

    mockedFs.unlinkSync.mockReturnValue(undefined);
    mockedFs.renameSync.mockReturnValue(undefined);

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ sourceGroup: 'whatsapp_main' }),
      'Error reading IPC messages directory',
    );
    // Tasks still processed despite messages error
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(taskPath);
  });

  // 15. Tasks dir read error → logger.error, continues to next group
  it('logs error and continues to next group when tasks dir read fails', async () => {
    const msgPath = `${IPC_BASE}/whatsapp_main/messages/msg1.json`;
    const msgContent = JSON.stringify({
      type: 'message',
      chatJid: 'other@g.us',
      text: 'before task error',
    });

    const messagesDir = `${IPC_BASE}/whatsapp_main/messages`;
    const tasksDir = `${IPC_BASE}/whatsapp_main/tasks`;

    mockedFs.mkdirSync.mockReturnValue(undefined as any);

    mockedFs.readdirSync.mockImplementation(((p: string) => {
      if (p === IPC_BASE) return ['whatsapp_main'] as any;
      if (p === messagesDir) return ['msg1.json'] as any;
      if (p === tasksDir) throw new Error('permission denied');
      return [] as any;
    }) as any);

    mockedFs.statSync.mockImplementation((() => ({
      isDirectory: () => true,
    })) as any);

    mockedFs.existsSync.mockImplementation(
      ((p: string) => p === messagesDir || p === tasksDir) as any,
    );

    mockedFs.readFileSync.mockImplementation(((p: string) => {
      if (p === msgPath) return msgContent;
      throw new Error('ENOENT');
    }) as any);

    mockedFs.unlinkSync.mockReturnValue(undefined);
    mockedFs.renameSync.mockReturnValue(undefined);

    const deps = makeDeps();
    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(0);

    // Message still sent despite upcoming task error
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'other@g.us',
      'before task error',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ sourceGroup: 'whatsapp_main' }),
      'Error reading IPC tasks directory',
    );
  });
});

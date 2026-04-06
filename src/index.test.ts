import { describe, it, expect, vi, beforeEach } from 'vitest';

// Heavy mocking — index.ts has many dependencies
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
  ASSISTANT_NAME: 'TestBot',
  COPILOT_GITHUB_TOKEN: 'fake-token',
  COPILOT_MODEL: 'test-model',
  DEFAULT_TRIGGER: '@TestBot',
  getTriggerPattern: vi.fn((t: string) => new RegExp(t || '@TestBot', 'i')),
  GROUPS_DIR: '/mock/groups',
  IDLE_TIMEOUT: 30000,
  MAX_MESSAGES_PER_PROMPT: 50,
  POLL_INTERVAL: 5000,
  TIMEZONE: 'UTC',
}));
vi.mock('./db.js', () => ({
  getAllChats: vi.fn(() => []),
  getAllRegisteredGroups: vi.fn(() => ({})),
  getAllSessions: vi.fn(() => ({})),
  deleteSession: vi.fn(),
  getAllTasks: vi.fn(() => []),
  getLastBotMessageTimestamp: vi.fn(),
  getMessagesSince: vi.fn(() => []),
  getNewMessages: vi.fn(() => []),
  getRouterState: vi.fn(),
  initDatabase: vi.fn(),
  setRegisteredGroup: vi.fn(),
  setRouterState: vi.fn(),
  setSession: vi.fn(),
  storeChatMetadata: vi.fn(),
  storeMessage: vi.fn(),
}));
vi.mock('./container-runner.js', () => ({
  runContainerAgent: vi.fn(),
  writeGroupsSnapshot: vi.fn(),
  writeTasksSnapshot: vi.fn(),
}));
vi.mock('./container-runtime.js', () => ({
  ensureContainerRuntimeRunning: vi.fn(),
  cleanupOrphans: vi.fn(),
}));
vi.mock('./session-cleanup.js', () => ({
  startSessionCleanup: vi.fn(),
}));
vi.mock('./channels/index.js', () => ({}));
vi.mock('./channels/registry.js', () => ({
  getChannelFactory: vi.fn(),
  getRegisteredChannelNames: vi.fn(() => []),
}));
vi.mock('./group-queue.js', () => {
  class MockGroupQueue {
    enqueueMessageCheck = vi.fn();
    registerProcess = vi.fn();
    closeStdin = vi.fn();
    notifyIdle = vi.fn();
    setProcessMessagesFn = vi.fn();
    shutdown = vi.fn();
  }
  return { GroupQueue: MockGroupQueue };
});
vi.mock('./group-folder.js', () => ({
  resolveGroupFolderPath: vi.fn((folder: string) => `/mock/groups/${folder}`),
}));
vi.mock('./ipc.js', () => ({
  startIpcWatcher: vi.fn(),
}));
vi.mock('./router.js', () => ({
  escapeXml: vi.fn((s: string) => s),
  formatMessages: vi.fn(
    (msgs: Array<{ sender_name: string; content: string }>) =>
      msgs.map((m) => `${m.sender_name}: ${m.content}`).join('\n'),
  ),
  formatOutbound: vi.fn((s: string) => s),
  findChannel: vi.fn(),
}));
vi.mock('./sender-allowlist.js', () => ({
  loadSenderAllowlist: vi.fn(() => ({ mode: 'off' })),
  isSenderAllowed: vi.fn(() => true),
  isTriggerAllowed: vi.fn(() => true),
  shouldDropMessage: vi.fn(() => false),
}));
vi.mock('./task-scheduler.js', () => ({
  startSchedulerLoop: vi.fn(),
}));

import fs from 'fs';
import { logger } from './logger.js';
import {
  getRouterState,
  getAllSessions,
  getAllRegisteredGroups,
  getLastBotMessageTimestamp,
  getMessagesSince,
  setRouterState,
  setRegisteredGroup,
  deleteSession,
  setSession,
} from './db.js';
import { runContainerAgent } from './container-runner.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { findChannel } from './router.js';
import {
  _loadState,
  _getOrRecoverCursor,
  _saveState,
  _registerGroup,
  _processGroupMessages,
  _runAgent,
  _setRegisteredGroups,
  _recoverPendingMessages,
  _ensureContainerSystemRunning,
  getAvailableGroups,
} from './index.js';

const mockedFs = vi.mocked(fs);

describe('index.ts orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset registeredGroups via the test helper
    _setRegisteredGroups({});
  });

  describe('loadState', () => {
    it('loads state from database', () => {
      vi.mocked(getRouterState).mockReturnValue('');
      vi.mocked(getAllSessions).mockReturnValue({ grp1: 'sess-1' });
      vi.mocked(getAllRegisteredGroups).mockReturnValue({});

      _loadState();

      expect(getRouterState).toHaveBeenCalledWith('last_timestamp');
      expect(getAllSessions).toHaveBeenCalled();
      expect(getAllRegisteredGroups).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ groupCount: 0 }),
        'State loaded',
      );
    });

    it('handles corrupted last_agent_timestamp gracefully', () => {
      vi.mocked(getRouterState).mockImplementation((key) => {
        if (key === 'last_agent_timestamp') return 'not-json!!!';
        return '';
      });
      vi.mocked(getAllSessions).mockReturnValue({});
      vi.mocked(getAllRegisteredGroups).mockReturnValue({});

      // Should not throw
      _loadState();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Corrupted'),
      );
    });
  });

  describe('getOrRecoverCursor', () => {
    it('returns empty string when no cursor and no bot messages', () => {
      vi.mocked(getLastBotMessageTimestamp).mockReturnValue(undefined);

      const cursor = _getOrRecoverCursor('chat-1');

      expect(cursor).toBe('');
    });

    it('recovers cursor from last bot message', () => {
      vi.mocked(getLastBotMessageTimestamp).mockReturnValue(
        '2024-01-01T00:00:00Z',
      );

      const cursor = _getOrRecoverCursor('chat-1');

      expect(cursor).toBe('2024-01-01T00:00:00Z');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ recoveredFrom: '2024-01-01T00:00:00Z' }),
        expect.stringContaining('Recovered'),
      );
    });
  });

  describe('saveState', () => {
    it('persists state to database', () => {
      _saveState();

      expect(setRouterState).toHaveBeenCalledWith(
        'last_timestamp',
        expect.any(String),
      );
      expect(setRouterState).toHaveBeenCalledWith(
        'last_agent_timestamp',
        expect.any(String),
      );
    });
  });

  describe('registerGroup', () => {
    it('registers a new group and creates directories', () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.readFileSync.mockReturnValue('# Andy\nYou are Andy');

      _registerGroup('chat-1', {
        name: 'Test Group',
        folder: 'test_group',
        trigger: '@TestBot',
        added_at: new Date().toISOString(),
        isMain: false,
      });

      expect(setRegisteredGroup).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({
          name: 'Test Group',
        }),
      );
      expect(mockedFs.mkdirSync).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jid: 'chat-1', name: 'Test Group' }),
        'Group registered',
      );
    });

    it('copies CLAUDE.md template and replaces assistant name', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        const ps = String(p);
        if (ps.includes('CLAUDE.md') && ps.includes('test_group')) return false;
        if (ps.includes('CLAUDE.md') && ps.includes('global')) return true;
        return false;
      });
      mockedFs.readFileSync.mockReturnValue(
        '# Andy\nYou are Andy, a helpful assistant.',
      );

      _registerGroup('chat-1', {
        name: 'Test',
        folder: 'test_group',
        trigger: '@TestBot',
        added_at: new Date().toISOString(),
        isMain: false,
      });

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md'),
        expect.stringContaining('# TestBot'),
      );
    });

    it('rejects group with invalid folder path', () => {
      vi.mocked(resolveGroupFolderPath).mockImplementation(() => {
        throw new Error('Invalid folder');
      });

      _registerGroup('chat-1', {
        name: 'Bad Group',
        folder: '../escape',
        trigger: '@TestBot',
        added_at: new Date().toISOString(),
      });

      expect(setRegisteredGroup).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jid: 'chat-1' }),
        expect.stringContaining('Rejecting'),
      );
    });
  });

  describe('getAvailableGroups', () => {
    it('returns empty array when no groups registered', () => {
      const groups = getAvailableGroups();
      expect(groups).toEqual([]);
    });
  });

  describe('processGroupMessages', () => {
    it('returns true when group not found', async () => {
      const result = await _processGroupMessages('unknown-jid');
      expect(result).toBe(true);
    });

    it('returns true when no messages pending', async () => {
      _setRegisteredGroups({
        'chat-1': {
          name: 'G1',
          folder: 'g1',
          trigger: '@Bot',
          isMain: true,
          added_at: new Date().toISOString(),
        },
      });
      vi.mocked(findChannel).mockReturnValue({
        name: 'mock',
        sendMessage: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        ownsJid: vi.fn(() => true),
        isConnected: vi.fn(() => true),
      });
      vi.mocked(getMessagesSince).mockReturnValue([]);

      const result = await _processGroupMessages('chat-1');
      expect(result).toBe(true);
    });

    it('returns true when no channel owns the JID', async () => {
      _setRegisteredGroups({
        'chat-1': {
          name: 'G1',
          folder: 'g1',
          trigger: '@Bot',
          added_at: new Date().toISOString(),
        },
      });
      vi.mocked(findChannel).mockReturnValue(undefined);

      const result = await _processGroupMessages('chat-1');
      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ chatJid: 'chat-1' }),
        expect.stringContaining('No channel'),
      );
    });
  });

  describe('runAgent', () => {
    const testGroup = {
      name: 'Test',
      folder: 'test_group',
      trigger: '@Bot',
      added_at: new Date().toISOString(),
      isMain: false,
    };

    it('returns success on successful container run', async () => {
      vi.mocked(runContainerAgent).mockResolvedValue({
        status: 'success',
        result: 'Agent response',
      });

      const result = await _runAgent(testGroup, 'prompt', 'chat-1');

      expect(result).toBe('success');
      expect(runContainerAgent).toHaveBeenCalled();
    });

    it('returns error on container error', async () => {
      vi.mocked(runContainerAgent).mockResolvedValue({
        status: 'error',
        error: 'something failed',
        result: '',
      });

      const result = await _runAgent(testGroup, 'prompt', 'chat-1');

      expect(result).toBe('error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('detects stale session and clears it', async () => {
      // Setup: group has an existing session
      _setRegisteredGroups({ 'chat-1': testGroup });
      vi.mocked(getAllSessions).mockReturnValue({ test_group: 'old-session' });
      vi.mocked(getRouterState).mockReturnValue('');
      vi.mocked(getAllRegisteredGroups).mockReturnValue({});
      _loadState();

      vi.mocked(runContainerAgent).mockResolvedValue({
        status: 'error',
        error: 'no conversation found for session',
        result: '',
      });

      await _runAgent(testGroup, 'prompt', 'chat-1');

      expect(deleteSession).toHaveBeenCalledWith('test_group');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ staleSessionId: 'old-session' }),
        expect.stringContaining('Stale session'),
      );
    });

    it('returns error when container throws', async () => {
      vi.mocked(runContainerAgent).mockRejectedValue(new Error('spawn failed'));

      const result = await _runAgent(testGroup, 'prompt', 'chat-1');

      expect(result).toBe('error');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Agent error',
      );
    });

    it('tracks new session ID from output', async () => {
      vi.mocked(runContainerAgent).mockResolvedValue({
        status: 'success',
        result: 'response',
        newSessionId: 'new-sess-123',
      });

      await _runAgent(testGroup, 'prompt', 'chat-1');

      expect(setSession).toHaveBeenCalledWith('test_group', 'new-sess-123');
    });
  });

  describe('recoverPendingMessages', () => {
    it('is callable without error', () => {
      _setRegisteredGroups({});
      // Should not throw when no groups
      expect(() => _recoverPendingMessages()).not.toThrow();
    });
  });

  describe('ensureContainerSystemRunning', () => {
    it('delegates to container-runtime', async () => {
      const { ensureContainerRuntimeRunning, cleanupOrphans } = vi.mocked(
        await import('./container-runtime.js'),
      );

      _ensureContainerSystemRunning();

      expect(ensureContainerRuntimeRunning).toHaveBeenCalled();
      expect(cleanupOrphans).toHaveBeenCalled();
    });
  });
});

/**
 * Expanded db.ts tests — covers session CRUD, router state, task runs,
 * cleanupOrphans, and edge cases not in db.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  _initTestDatabase,
  getRouterState,
  setRouterState,
  getSession,
  setSession,
  deleteSession,
  getAllSessions,
  getRegisteredGroup,
  setRegisteredGroup,
  getAllRegisteredGroups,
  createTask,
  getTaskById,
  getTasksForGroup,
  getAllTasks,
  getDueTasks,
  updateTaskAfterRun,
  getLastGroupSync,
  setLastGroupSync,
  updateChatName,
  getAllChats,
  storeChatMetadata,
  getLastBotMessageTimestamp,
  storeMessage,
} from './db.js';

beforeEach(() => {
  _initTestDatabase();
});

describe('router state', () => {
  it('returns undefined for missing key', () => {
    expect(getRouterState('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    setRouterState('test_key', 'test_value');
    expect(getRouterState('test_key')).toBe('test_value');
  });

  it('overwrites existing value', () => {
    setRouterState('key', 'v1');
    setRouterState('key', 'v2');
    expect(getRouterState('key')).toBe('v2');
  });
});

describe('session management', () => {
  it('returns undefined for missing session', () => {
    expect(getSession('nonexistent')).toBeUndefined();
  });

  it('stores and retrieves a session', () => {
    setSession('group1', 'sess-abc');
    expect(getSession('group1')).toBe('sess-abc');
  });

  it('deletes a session', () => {
    setSession('group1', 'sess-abc');
    deleteSession('group1');
    expect(getSession('group1')).toBeUndefined();
  });

  it('returns all sessions', () => {
    setSession('g1', 's1');
    setSession('g2', 's2');
    const all = getAllSessions();
    expect(all).toEqual({ g1: 's1', g2: 's2' });
  });

  it('returns empty object when no sessions', () => {
    expect(getAllSessions()).toEqual({});
  });
});

describe('registered groups', () => {
  it('returns undefined for unregistered group', () => {
    expect(getRegisteredGroup('unknown@jid')).toBeUndefined();
  });

  it('stores and retrieves a group', () => {
    setRegisteredGroup('test@g.us', {
      name: 'Test',
      folder: 'test',
      trigger: '@Bot',
      added_at: new Date().toISOString(),
    });
    const group = getRegisteredGroup('test@g.us');
    expect(group?.name).toBe('Test');
    expect(group?.folder).toBe('test');
  });

  it('returns all registered groups', () => {
    const now = new Date().toISOString();
    setRegisteredGroup('a@g.us', {
      name: 'A',
      folder: 'a',
      trigger: '@Bot',
      added_at: now,
    });
    setRegisteredGroup('b@g.us', {
      name: 'B',
      folder: 'b',
      trigger: '@Bot',
      added_at: now,
    });
    const all = getAllRegisteredGroups();
    expect(Object.keys(all)).toHaveLength(2);
  });

  it('updates group on re-register', () => {
    const now = new Date().toISOString();
    setRegisteredGroup('a@g.us', {
      name: 'Old',
      folder: 'a',
      trigger: '@Bot',
      added_at: now,
    });
    setRegisteredGroup('a@g.us', {
      name: 'New',
      folder: 'a',
      trigger: '@Bot',
      added_at: now,
    });
    expect(getRegisteredGroup('a@g.us')?.name).toBe('New');
  });
});

describe('task lifecycle', () => {
  const baseTask = {
    id: 'task-1',
    group_folder: 'g1',
    chat_jid: 'chat@g.us',
    prompt: 'Do something',
    schedule_type: 'interval' as const,
    schedule_value: '60000',
    context_mode: 'isolated' as const,
    next_run: new Date(Date.now() - 1000).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    source_jid: 'chat@g.us',
  };

  it('returns undefined for non-existent task', () => {
    expect(getTaskById('nonexistent')).toBeUndefined();
  });

  it('lists tasks by group folder', () => {
    createTask(baseTask as any);
    createTask({ ...baseTask, id: 'task-2', group_folder: 'g2' } as any);

    expect(getTasksForGroup('g1')).toHaveLength(1);
    expect(getTasksForGroup('g2')).toHaveLength(1);
    expect(getTasksForGroup('g3')).toHaveLength(0);
  });

  it('lists all tasks', () => {
    createTask(baseTask as any);
    createTask({ ...baseTask, id: 'task-2' } as any);
    expect(getAllTasks()).toHaveLength(2);
  });

  it('getDueTasks excludes future tasks', () => {
    createTask({
      ...baseTask,
      next_run: new Date(Date.now() + 999999).toISOString(),
    } as any);
    expect(getDueTasks()).toHaveLength(0);
  });

  it('updateTaskAfterRun sets next_run and last_result', () => {
    createTask(baseTask as any);
    const nextRun = new Date(Date.now() + 60000).toISOString();
    updateTaskAfterRun('task-1', nextRun, 'Success');
    const task = getTaskById('task-1');
    expect(task?.next_run).toBe(nextRun);
    expect(task?.last_result).toBe('Success');
  });

  it('updateTaskAfterRun with null next_run (once task)', () => {
    createTask({ ...baseTask, schedule_type: 'once' } as any);
    updateTaskAfterRun('task-1', null, 'Done');
    const task = getTaskById('task-1');
    expect(task?.status).toBe('completed');
  });
});

describe('group sync', () => {
  it('returns null when no sync has occurred', () => {
    expect(getLastGroupSync()).toBeNull();
  });

  it('stores and retrieves last sync timestamp', () => {
    setLastGroupSync();
    const sync = getLastGroupSync();
    expect(sync).toBeTruthy();
  });
});

describe('chat name update', () => {
  it('updates chat name via updateChatName', () => {
    storeChatMetadata('test@g.us', '2024-01-01T00:00:00Z', 'Old Name');
    updateChatName('test@g.us', 'New Name');
    const chats = getAllChats();
    const chat = chats.find((c) => c.jid === 'test@g.us');
    expect(chat?.name).toBe('New Name');
  });
});

describe('getLastBotMessageTimestamp', () => {
  it('returns undefined when no bot messages exist', () => {
    expect(getLastBotMessageTimestamp('test@g.us', 'Bot')).toBeUndefined();
  });

  it('returns timestamp of last bot message', () => {
    storeChatMetadata('test@g.us', '2024-01-01T00:00:00Z');
    storeMessage({
      id: 'msg-1',
      chat_jid: 'test@g.us',
      sender: 'bot',
      sender_name: 'Bot',
      content: 'Hello',
      timestamp: '2024-01-01T12:00:00Z',
      is_from_me: true,
      is_bot_message: true,
    });

    const ts = getLastBotMessageTimestamp('test@g.us', 'Bot');
    expect(ts).toBe('2024-01-01T12:00:00Z');
  });
});

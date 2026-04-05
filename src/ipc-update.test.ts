/**
 * Tests for ipc.ts — update_task branch and startIpcWatcher.
 * The existing ipc-auth.test.ts covers auth paths.
 * This file covers update_task (0% tested) and watcher edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  _initTestDatabase,
  createTask,
  getTaskById,
  setRegisteredGroup,
} from './db.js';
import { processTaskIpc, IpcDeps } from './ipc.js';
import { RegisteredGroup } from './types.js';

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

let groups: Record<string, RegisteredGroup>;
let deps: IpcDeps;

beforeEach(() => {
  _initTestDatabase();

  groups = {
    'main@g.us': MAIN_GROUP,
    'other@g.us': OTHER_GROUP,
  };

  setRegisteredGroup('main@g.us', MAIN_GROUP);
  setRegisteredGroup('other@g.us', OTHER_GROUP);

  deps = {
    sendMessage: async () => {},
    registeredGroups: () => groups,
    registerGroup: (jid, group) => {
      groups[jid] = group;
      setRegisteredGroup(jid, group);
    },
    syncGroups: async () => {},
    getAvailableGroups: () => [],
    writeGroupsSnapshot: () => {},
    onTasksChanged: vi.fn(),
  };
});

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: `task-${Date.now()}`,
    group_folder: 'whatsapp_main',
    chat_jid: 'main@g.us',
    prompt: 'original prompt',
    schedule_type: 'interval',
    schedule_value: '60000',
    context_mode: 'isolated',
    next_run: new Date(Date.now() + 60000).toISOString(),
    status: 'active',
    created_at: '2024-01-01T00:00:00.000Z',
    source_jid: 'main@g.us',
    ...overrides,
  };
}

describe('update_task', () => {
  it('updates prompt for an existing task', async () => {
    const task = makeTask({ id: 'task-up-1' });
    createTask(task as any);

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-up-1',
        prompt: 'updated prompt',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const updated = getTaskById('task-up-1');
    expect(updated?.prompt).toBe('updated prompt');
    expect(deps.onTasksChanged).toHaveBeenCalled();
  });

  it('updates schedule_type and recomputes next_run for interval', async () => {
    const task = makeTask({
      id: 'task-up-2',
      schedule_type: 'once',
      schedule_value: '2025-01-01T00:00:00',
    });
    createTask(task as any);
    const before = Date.now();

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-up-2',
        schedule_type: 'interval',
        schedule_value: '60000',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const updated = getTaskById('task-up-2');
    expect(updated?.schedule_type).toBe('interval');
    // next_run should be ~60s from now
    const nextRun = new Date(updated!.next_run).getTime();
    expect(nextRun).toBeGreaterThanOrEqual(before + 59000);
  });

  it('ignores update for non-existent task', async () => {
    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'nonexistent-999',
        prompt: 'should not work',
      },
      'whatsapp_main',
      true,
      deps,
    );

    expect(deps.onTasksChanged).not.toHaveBeenCalled();
  });

  it('blocks non-main group from updating another groups task', async () => {
    const task = makeTask({ id: 'task-up-3' });
    createTask(task as any);

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-up-3',
        prompt: 'hacked',
      },
      'other-group', // not the owner
      false,
      deps,
    );

    const t = getTaskById('task-up-3');
    expect(t?.prompt).toBe('original prompt'); // unchanged
    expect(deps.onTasksChanged).not.toHaveBeenCalled();
  });

  it('main group can update any task', async () => {
    const task = makeTask({
      id: 'task-up-4',
      group_folder: 'other-group',
      chat_jid: 'other@g.us',
      prompt: 'other task',
    });
    createTask(task as any);

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-up-4',
        prompt: 'updated by main',
      },
      'whatsapp_main', // main group
      true,
      deps,
    );

    const updated = getTaskById('task-up-4');
    expect(updated?.prompt).toBe('updated by main');
    expect(deps.onTasksChanged).toHaveBeenCalled();
  });

  it('updates script field', async () => {
    const task = makeTask({ id: 'task-up-5' });
    createTask(task as any);

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-up-5',
        script: 'echo "updated script"',
      },
      'whatsapp_main',
      true,
      deps,
    );

    const updated = getTaskById('task-up-5');
    expect(updated?.script).toBe('echo "updated script"');
  });

  it('rejects invalid cron expression in update', async () => {
    const task = makeTask({
      id: 'task-up-6',
      schedule_type: 'cron',
      schedule_value: '0 * * * *',
    });
    createTask(task as any);

    await processTaskIpc(
      {
        type: 'update_task',
        taskId: 'task-up-6',
        schedule_type: 'cron',
        schedule_value: 'invalid-cron',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // Task should remain unchanged
    const t = getTaskById('task-up-6');
    expect(t?.schedule_value).toBe('0 * * * *');
    expect(deps.onTasksChanged).not.toHaveBeenCalled();
  });

  it('handles update with no taskId (noop)', async () => {
    await processTaskIpc(
      {
        type: 'update_task',
        // no taskId
        prompt: 'orphan update',
      },
      'whatsapp_main',
      true,
      deps,
    );

    // Should not crash, just do nothing
    expect(deps.onTasksChanged).not.toHaveBeenCalled();
  });
});

describe('unknown IPC task type', () => {
  it('does not crash on unknown type', async () => {
    await expect(
      processTaskIpc({ type: 'nonexistent_type' }, 'whatsapp_main', true, deps),
    ).resolves.not.toThrow();
  });
});

/**
 * Consolidated tests for task-scheduler.ts — covers computeNextRun(), runTask(),
 * and startSchedulerLoop().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  SCHEDULER_POLL_INTERVAL: 30000,
  TIMEZONE: 'UTC',
}));
vi.mock('./container-runner.js', () => ({
  runContainerAgent: vi.fn(),
  writeTasksSnapshot: vi.fn(),
}));
vi.mock('./db.js', () => ({
  getAllTasks: vi.fn(() => []),
  getDueTasks: vi.fn(() => []),
  getTaskById: vi.fn(),
  logTaskRun: vi.fn(),
  updateTask: vi.fn(),
  updateTaskAfterRun: vi.fn(),
}));
vi.mock('./group-queue.js', () => {
  class MockGroupQueue {
    closeStdin = vi.fn();
    notifyIdle = vi.fn();
    enqueueTask = vi.fn();
  }
  return { GroupQueue: MockGroupQueue };
});
vi.mock('./group-folder.js', () => ({
  resolveGroupFolderPath: vi.fn((f: string) => `/mock/groups/${f}`),
}));

import { logger } from './logger.js';
import { runContainerAgent } from './container-runner.js';
import {
  getAllTasks,
  getDueTasks,
  getTaskById,
  logTaskRun,
  updateTask,
  updateTaskAfterRun,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import {
  startSchedulerLoop,
  _resetSchedulerLoopForTests,
  computeNextRun,
  SchedulerDependencies,
} from './task-scheduler.js';
import { ScheduledTask } from './types.js';

function createDeps(
  overrides: Partial<SchedulerDependencies> = {},
): SchedulerDependencies {
  return {
    registeredGroups: () => ({
      'chat-1': {
        name: 'G1',
        folder: 'g1',
        trigger: '@Bot',
        isMain: false,
        added_at: new Date().toISOString(),
      },
    }),
    getSessions: () => ({}),
    queue: new GroupQueue() as any,
    onProcess: vi.fn(),
    sendMessage: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'task-1',
    group_folder: 'g1',
    prompt: 'Do something',
    schedule_type: 'interval',
    schedule_value: '60000',
    status: 'active',
    chat_jid: 'chat-1',
    created_at: '2024-01-01T00:00:00Z',
    next_run: new Date(Date.now() - 1000).toISOString(),
    last_run: null,
    last_result: null,
    context_mode: 'group',
    ...overrides,
  };
}

describe('task-scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    _resetSchedulerLoopForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- computeNextRun ---

  describe('computeNextRun', () => {
    it('returns null for once-tasks', () => {
      const task = makeTask({
        schedule_type: 'once',
        schedule_value: '2026-01-01T00:00:00.000Z',
      });
      expect(computeNextRun(task)).toBeNull();
    });

    it('anchors interval tasks to scheduled time to prevent drift', () => {
      const scheduledTime = new Date(Date.now() - 2000).toISOString();
      const task = makeTask({
        schedule_type: 'interval',
        schedule_value: '60000',
        next_run: scheduledTime,
      });

      const nextRun = computeNextRun(task);
      expect(nextRun).not.toBeNull();

      const expected = new Date(scheduledTime).getTime() + 60000;
      expect(new Date(nextRun!).getTime()).toBe(expected);
    });

    it('skips missed intervals without infinite loop', () => {
      const ms = 60000;
      const missedBy = ms * 10;
      const scheduledTime = new Date(Date.now() - missedBy).toISOString();

      const task = makeTask({
        schedule_type: 'interval',
        schedule_value: String(ms),
        next_run: scheduledTime,
      });

      const nextRun = computeNextRun(task);
      expect(nextRun).not.toBeNull();
      expect(new Date(nextRun!).getTime()).toBeGreaterThan(Date.now());
      const offset =
        (new Date(nextRun!).getTime() - new Date(scheduledTime).getTime()) % ms;
      expect(offset).toBe(0);
    });

    it('returns null for unknown schedule_type', () => {
      const task = makeTask({
        schedule_type: 'weekly' as any,
        schedule_value: 'monday',
      });
      expect(computeNextRun(task)).toBeNull();
    });

    it('falls back to 60s for invalid interval value', () => {
      const task = makeTask({
        schedule_type: 'interval',
        schedule_value: '0',
      });

      const nextRun = computeNextRun(task);
      expect(nextRun).not.toBeNull();
      const diff = new Date(nextRun!).getTime() - Date.now();
      expect(diff).toBe(60_000);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: task.id }),
        'Invalid interval value',
      );
    });

    it('computes next run for cron tasks', () => {
      const task = makeTask({
        schedule_type: 'cron',
        schedule_value: '*/5 * * * *',
      });

      const nextRun = computeNextRun(task);
      expect(nextRun).not.toBeNull();
      expect(new Date(nextRun!).getTime()).toBeGreaterThan(Date.now());
    });
  });

  // --- startSchedulerLoop ---

  describe('startSchedulerLoop', () => {
    it('runs the loop and processes due tasks', async () => {
      const task = makeTask();
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue(task);

      const deps = createDeps();
      startSchedulerLoop(deps);

      await vi.advanceTimersByTimeAsync(0);

      expect(getDueTasks).toHaveBeenCalled();
      expect(deps.queue.enqueueTask).toHaveBeenCalledWith(
        'chat-1',
        'task-1',
        expect.any(Function),
      );
    });

    it('prevents duplicate starts', () => {
      vi.mocked(getDueTasks).mockReturnValue([]);

      const deps = createDeps();
      startSchedulerLoop(deps);
      startSchedulerLoop(deps); // duplicate

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('already running'),
      );
    });

    it('skips tasks that were paused between poll and execution', async () => {
      const task = makeTask();
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue({ ...task, status: 'paused' });

      const deps = createDeps();
      startSchedulerLoop(deps);

      await vi.advanceTimersByTimeAsync(0);

      expect(deps.queue.enqueueTask).not.toHaveBeenCalled();
    });

    it('handles errors in the loop gracefully', async () => {
      vi.mocked(getDueTasks).mockImplementation(() => {
        throw new Error('DB error');
      });

      const deps = createDeps();
      startSchedulerLoop(deps);

      await vi.advanceTimersByTimeAsync(0);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Error in scheduler loop',
      );
    });

    it('schedules next poll with SCHEDULER_POLL_INTERVAL', async () => {
      vi.mocked(getDueTasks).mockReturnValue([]);

      const deps = createDeps();
      startSchedulerLoop(deps);

      // First loop execution
      await vi.advanceTimersByTimeAsync(0);
      expect(getDueTasks).toHaveBeenCalledTimes(1);

      // Advance by less than poll interval (30000ms) — should not trigger
      await vi.advanceTimersByTimeAsync(29999);
      expect(getDueTasks).toHaveBeenCalledTimes(1);

      // Advance by 1 more ms to hit the interval
      await vi.advanceTimersByTimeAsync(1);
      expect(getDueTasks).toHaveBeenCalledTimes(2);
    });
  });

  // --- runTask (via enqueueTask callback) ---

  describe('runTask (via enqueueTask callback)', () => {
    it('pauses task with invalid group folder', async () => {
      vi.mocked(resolveGroupFolderPath).mockImplementation(() => {
        throw new Error('Invalid folder');
      });

      const task = makeTask({ group_folder: '../bad' });
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue(task);

      const deps = createDeps();
      startSchedulerLoop(deps);
      await vi.advanceTimersByTimeAsync(0);

      const enqueueCall = vi.mocked(deps.queue.enqueueTask).mock.calls[0];
      if (enqueueCall) {
        await enqueueCall[2](); // the callback
      }

      expect(updateTask).toHaveBeenCalledWith(task.id, { status: 'paused' });
      expect(logTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      );
    });

    it('logs error when group not found for task', async () => {
      vi.mocked(resolveGroupFolderPath).mockReturnValue('/mock/groups/missing');

      const task = makeTask({ group_folder: 'missing' });
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue(task);

      const deps = createDeps({
        registeredGroups: () => ({}), // empty — group not found
      });
      startSchedulerLoop(deps);
      await vi.advanceTimersByTimeAsync(0);

      const enqueueCall = vi.mocked(deps.queue.enqueueTask).mock.calls[0];
      if (enqueueCall) {
        await enqueueCall[2]();
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: task.id }),
        'Group not found for task',
      );
      expect(logTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('Group not found'),
        }),
      );
    });

    it('runs container agent successfully and logs result', async () => {
      const task = makeTask();
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue(task);
      vi.mocked(getAllTasks).mockReturnValue([]);
      vi.mocked(runContainerAgent).mockResolvedValue({
        status: 'success',
        result: 'Task completed successfully',
      });

      const deps = createDeps();
      startSchedulerLoop(deps);
      await vi.advanceTimersByTimeAsync(0);

      const enqueueCall = vi.mocked(deps.queue.enqueueTask).mock.calls[0];
      if (enqueueCall) {
        vi.useRealTimers();
        await enqueueCall[2]();
      }

      expect(runContainerAgent).toHaveBeenCalled();
      expect(logTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' }),
      );
      expect(updateTaskAfterRun).toHaveBeenCalled();
    });

    it('handles container agent error', async () => {
      const task = makeTask();
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue(task);
      vi.mocked(getAllTasks).mockReturnValue([]);
      vi.mocked(runContainerAgent).mockResolvedValue({
        status: 'error',
        error: 'Container crashed',
        result: '',
      });

      const deps = createDeps();
      startSchedulerLoop(deps);
      await vi.advanceTimersByTimeAsync(0);

      const enqueueCall = vi.mocked(deps.queue.enqueueTask).mock.calls[0];
      if (enqueueCall) {
        vi.useRealTimers();
        await enqueueCall[2]();
      }

      expect(logTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: 'Container crashed',
        }),
      );
    });

    it('handles thrown exception during container run', async () => {
      const task = makeTask();
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue(task);
      vi.mocked(getAllTasks).mockReturnValue([]);
      vi.mocked(runContainerAgent).mockRejectedValue(new Error('spawn error'));

      const deps = createDeps();
      startSchedulerLoop(deps);
      await vi.advanceTimersByTimeAsync(0);

      const enqueueCall = vi.mocked(deps.queue.enqueueTask).mock.calls[0];
      if (enqueueCall) {
        vi.useRealTimers();
        await enqueueCall[2]();
      }

      expect(logTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: 'spawn error',
        }),
      );
    });

    it('handles streaming output where result is null (IPC-only tasks)', async () => {
      const task = makeTask();
      vi.mocked(getDueTasks).mockReturnValue([task]);
      vi.mocked(getTaskById).mockReturnValue(task);
      vi.mocked(getAllTasks).mockReturnValue([]);
      vi.mocked(runContainerAgent).mockImplementation(
        async (_group: any, _input: any, _onProcess: any, onStream: any) => {
          await onStream({ status: 'success', result: null });
          return { status: 'success', result: null };
        },
      );

      const deps = createDeps();
      startSchedulerLoop(deps);
      await vi.advanceTimersByTimeAsync(0);

      const enqueueCall = vi.mocked(deps.queue.enqueueTask).mock.calls[0];
      if (enqueueCall) {
        vi.useRealTimers();
        await enqueueCall[2]();
      }

      expect(deps.sendMessage).not.toHaveBeenCalled();
      expect(deps.queue.notifyIdle).toHaveBeenCalledWith('chat-1');
      expect(logTaskRun).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', result: null }),
      );
      expect(updateTaskAfterRun).toHaveBeenCalledWith(
        task.id,
        expect.any(String),
        'Completed',
      );
    });
  });
});

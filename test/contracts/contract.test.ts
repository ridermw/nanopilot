/**
 * Contract tests — validate that host and container agree on JSON protocol.
 *
 * Round-trip: host builds → schema validates → agent parses correctly
 * One-way forward: agent-runner output fixtures pass host schema
 * One-way backward: host input fixtures cover all agent-runner parser fields
 */
import { describe, it, expect } from 'vitest';

import {
  ContainerInputSchema,
  ContainerOutputSchema,
} from '../../src/contracts/container.schema.js';
import {
  IpcMessageSchema,
  IpcTaskSchema,
} from '../../src/contracts/ipc.schema.js';

describe('ContainerInput contract', () => {
  const validInput = {
    prompt: 'Hello, help me with something',
    groupFolder: 'test_group',
    chatJid: 'tg:123456',
    isMain: false,
  };

  it('validates minimal input (required fields only)', () => {
    expect(ContainerInputSchema.parse(validInput)).toMatchObject(validInput);
  });

  it('validates full input with all optional fields', () => {
    const full = {
      ...validInput,
      sessionId: 'sess-abc-123',
      isScheduledTask: true,
      assistantName: 'Copilot',
      script: '#!/bin/bash\necho hello',
      githubToken: 'gho_test123',
    };
    expect(ContainerInputSchema.parse(full)).toMatchObject(full);
  });

  it('rejects missing required field: prompt', () => {
    const { prompt: _, ...noPrompt } = validInput;
    expect(() => ContainerInputSchema.parse(noPrompt)).toThrow();
  });

  it('rejects missing required field: groupFolder', () => {
    const { groupFolder: _, ...noFolder } = validInput;
    expect(() => ContainerInputSchema.parse(noFolder)).toThrow();
  });

  it('rejects missing required field: chatJid', () => {
    const { chatJid: _, ...noJid } = validInput;
    expect(() => ContainerInputSchema.parse(noJid)).toThrow();
  });

  it('rejects missing required field: isMain', () => {
    const { isMain: _, ...noMain } = validInput;
    expect(() => ContainerInputSchema.parse(noMain)).toThrow();
  });

  it('rejects wrong type for isMain', () => {
    expect(() =>
      ContainerInputSchema.parse({ ...validInput, isMain: 'yes' }),
    ).toThrow();
  });

  it('accepts undefined optional fields without adding them', () => {
    const result = ContainerInputSchema.parse(validInput);
    expect(result.sessionId).toBeUndefined();
    expect(result.isScheduledTask).toBeUndefined();
  });
});

describe('ContainerOutput contract', () => {
  it('validates success output', () => {
    const output = {
      status: 'success' as const,
      result: 'Agent response text',
      newSessionId: 'sess-new-456',
    };
    expect(ContainerOutputSchema.parse(output)).toMatchObject(output);
  });

  it('validates error output', () => {
    const output = {
      status: 'error' as const,
      result: null,
      error: 'Something went wrong',
    };
    expect(ContainerOutputSchema.parse(output)).toMatchObject(output);
  });

  it('validates success with null result', () => {
    const output = { status: 'success' as const, result: null };
    expect(ContainerOutputSchema.parse(output)).toMatchObject(output);
  });

  it('rejects invalid status value', () => {
    expect(() =>
      ContainerOutputSchema.parse({ status: 'pending', result: null }),
    ).toThrow();
  });

  it('rejects missing result field', () => {
    expect(() => ContainerOutputSchema.parse({ status: 'success' })).toThrow();
  });
});

describe('IpcMessage contract', () => {
  it('validates a message', () => {
    const msg = { type: 'message' as const, chatJid: 'tg:123', text: 'Hello' };
    expect(IpcMessageSchema.parse(msg)).toMatchObject(msg);
  });

  it('rejects missing chatJid', () => {
    expect(() =>
      IpcMessageSchema.parse({ type: 'message', text: 'Hello' }),
    ).toThrow();
  });

  it('rejects missing text', () => {
    expect(() =>
      IpcMessageSchema.parse({ type: 'message', chatJid: 'tg:123' }),
    ).toThrow();
  });

  it('rejects wrong type literal', () => {
    expect(() =>
      IpcMessageSchema.parse({ type: 'task', chatJid: 'tg:123', text: 'x' }),
    ).toThrow();
  });
});

describe('IpcTask contract — discriminated union', () => {
  it('validates schedule_task with all required fields', () => {
    const task = {
      type: 'schedule_task' as const,
      prompt: 'Check status',
      targetJid: 'tg:456',
      schedule_type: 'cron' as const,
      schedule_value: '0 9 * * *',
    };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('validates schedule_task with optional fields', () => {
    const task = {
      type: 'schedule_task' as const,
      prompt: 'Run report',
      targetJid: 'tg:456',
      schedule_type: 'interval' as const,
      schedule_value: '3600000',
      taskId: 'task-custom-id',
      context_mode: 'group' as const,
      script: '#!/bin/bash\ndate',
    };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('rejects schedule_task with invalid schedule_type', () => {
    expect(() =>
      IpcTaskSchema.parse({
        type: 'schedule_task',
        prompt: 'x',
        targetJid: 'tg:1',
        schedule_type: 'weekly',
        schedule_value: '1',
      }),
    ).toThrow();
  });

  it('validates pause_task', () => {
    const task = { type: 'pause_task' as const, taskId: 'task-1' };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('validates resume_task', () => {
    const task = { type: 'resume_task' as const, taskId: 'task-1' };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('validates cancel_task', () => {
    const task = { type: 'cancel_task' as const, taskId: 'task-1' };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('validates update_task with partial updates', () => {
    const task = {
      type: 'update_task' as const,
      taskId: 'task-1',
      prompt: 'Updated prompt',
    };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('validates update_task with schedule change', () => {
    const task = {
      type: 'update_task' as const,
      taskId: 'task-1',
      schedule_type: 'interval' as const,
      schedule_value: '60000',
    };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('validates refresh_groups', () => {
    expect(
      IpcTaskSchema.parse({ type: 'refresh_groups' }),
    ).toMatchObject({ type: 'refresh_groups' });
  });

  it('validates register_group with required fields', () => {
    const task = {
      type: 'register_group' as const,
      jid: 'tg:789',
      name: 'Test Group',
      folder: 'test_group',
      trigger: '@Andy',
    };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('validates register_group with optional containerConfig', () => {
    const task = {
      type: 'register_group' as const,
      jid: 'tg:789',
      name: 'Test',
      folder: 'test_group',
      trigger: '@Andy',
      requiresTrigger: true,
      containerConfig: {
        additionalMounts: [
          { hostPath: '/data', containerPath: 'data', readonly: true },
        ],
        timeout: 600000,
      },
    };
    expect(IpcTaskSchema.parse(task)).toMatchObject(task);
  });

  it('rejects unknown task type', () => {
    expect(() =>
      IpcTaskSchema.parse({ type: 'unknown_action' }),
    ).toThrow();
  });

  it('rejects pause_task without taskId', () => {
    expect(() => IpcTaskSchema.parse({ type: 'pause_task' })).toThrow();
  });
});

describe('One-way contract validation', () => {
  // Forward: agent-runner output fixtures pass host schema
  it('agent success output passes host ContainerOutput schema', () => {
    const agentOutput = {
      status: 'success',
      result: 'I completed the task',
      newSessionId: 'sess-abc',
    };
    expect(() => ContainerOutputSchema.parse(agentOutput)).not.toThrow();
  });

  it('agent error output passes host ContainerOutput schema', () => {
    const agentOutput = {
      status: 'error',
      result: null,
      error: 'no conversation found with ID sess-old',
    };
    expect(() => ContainerOutputSchema.parse(agentOutput)).not.toThrow();
  });

  // Backward: host input fixtures cover all fields agent parser expects
  it('host ContainerInput covers all fields agent-runner parses', () => {
    // This fixture must include EVERY field that agent-runner/src/index.ts reads
    const hostInput = {
      prompt: 'Test prompt',
      sessionId: 'sess-123',
      groupFolder: 'test_group',
      chatJid: 'tg:456',
      isMain: true,
      isScheduledTask: true,
      assistantName: 'Copilot',
      script: '#!/bin/bash\necho test',
      githubToken: 'gho_testtoken',
    };
    const parsed = ContainerInputSchema.parse(hostInput);
    // Verify every field the agent-runner reads is present
    expect(parsed.prompt).toBeDefined();
    expect(parsed.sessionId).toBeDefined();
    expect(parsed.groupFolder).toBeDefined();
    expect(parsed.chatJid).toBeDefined();
    expect(parsed.isMain).toBeDefined();
    expect(parsed.isScheduledTask).toBeDefined();
    expect(parsed.assistantName).toBeDefined();
    expect(parsed.script).toBeDefined();
    expect(parsed.githubToken).toBeDefined();
  });

  // Forward: IPC message from container passes host schema
  it('container IPC message passes host IpcMessage schema', () => {
    const containerMsg = {
      type: 'message',
      chatJid: 'tg:123',
      text: 'Response from agent',
    };
    expect(() => IpcMessageSchema.parse(containerMsg)).not.toThrow();
  });

  // Forward: IPC task from container passes host schema
  it('container IPC schedule_task passes host IpcTask schema', () => {
    const containerTask = {
      type: 'schedule_task',
      prompt: 'Daily report',
      targetJid: 'tg:456',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      context_mode: 'isolated',
    };
    expect(() => IpcTaskSchema.parse(containerTask)).not.toThrow();
  });
});

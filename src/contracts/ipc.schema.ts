/**
 * Zod schemas for IPC file protocols.
 * These validate JSON files written by the container and read by the host.
 *
 * IpcMessage: written to /workspace/ipc/messages/*.json
 * IpcTask: written to /workspace/ipc/tasks/*.json (discriminated union on type)
 */
import { z } from 'zod';

// IPC message files (container → host)
export const IpcMessageSchema = z.object({
  type: z.literal('message'),
  chatJid: z.string(),
  text: z.string(),
});

// Individual task type schemas
const ScheduleTaskSchema = z.object({
  type: z.literal('schedule_task'),
  prompt: z.string(),
  targetJid: z.string(),
  schedule_type: z.enum(['cron', 'interval', 'once']),
  schedule_value: z.string(),
  taskId: z.string().optional(),
  context_mode: z.enum(['group', 'isolated']).optional(),
  script: z.string().optional(),
});

const PauseTaskSchema = z.object({
  type: z.literal('pause_task'),
  taskId: z.string(),
});

const ResumeTaskSchema = z.object({
  type: z.literal('resume_task'),
  taskId: z.string(),
});

const CancelTaskSchema = z.object({
  type: z.literal('cancel_task'),
  taskId: z.string(),
});

const UpdateTaskSchema = z.object({
  type: z.literal('update_task'),
  taskId: z.string(),
  prompt: z.string().optional(),
  script: z.string().optional(),
  schedule_type: z.enum(['cron', 'interval', 'once']).optional(),
  schedule_value: z.string().optional(),
});

const RefreshGroupsSchema = z.object({
  type: z.literal('refresh_groups'),
});

const RegisterGroupSchema = z.object({
  type: z.literal('register_group'),
  jid: z.string(),
  name: z.string(),
  folder: z.string(),
  trigger: z.string(),
  requiresTrigger: z.boolean().optional(),
  containerConfig: z
    .object({
      additionalMounts: z.array(z.string()).optional(),
      environment: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

// Discriminated union of all IPC task types
export const IpcTaskSchema = z.discriminatedUnion('type', [
  ScheduleTaskSchema,
  PauseTaskSchema,
  ResumeTaskSchema,
  CancelTaskSchema,
  UpdateTaskSchema,
  RefreshGroupsSchema,
  RegisterGroupSchema,
]);

export type IpcMessageFromSchema = z.infer<typeof IpcMessageSchema>;
export type IpcTaskFromSchema = z.infer<typeof IpcTaskSchema>;

/**
 * Zod schemas for the host↔container JSON protocol.
 * These mirror the ContainerInput/ContainerOutput types in src/container-runner.ts
 * and are used by contract tests to validate protocol compatibility.
 *
 * ContainerInput: sent from host to container via stdin
 * ContainerOutput: sent from container to host via stdout (wrapped in markers)
 */
import { z } from 'zod';

export const ContainerInputSchema = z.object({
  prompt: z.string(),
  sessionId: z.string().optional(),
  groupFolder: z.string(),
  chatJid: z.string(),
  isMain: z.boolean(),
  isScheduledTask: z.boolean().optional(),
  assistantName: z.string().optional(),
  script: z.string().optional(),
  githubToken: z.string().optional(),
});

export const ContainerOutputSchema = z.object({
  status: z.enum(['success', 'error']),
  result: z.string().nullable(),
  newSessionId: z.string().optional(),
  error: z.string().optional(),
});

export type ContainerInputFromSchema = z.infer<typeof ContainerInputSchema>;
export type ContainerOutputFromSchema = z.infer<typeof ContainerOutputSchema>;

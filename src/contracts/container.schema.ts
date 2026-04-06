/**
 * Zod schemas for the host↔container JSON protocol.
 * These are the single source of truth — TypeScript types are inferred from these schemas.
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

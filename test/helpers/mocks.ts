/**
 * Shared mock factories for NanoPilot tests.
 * Import these instead of copy-pasting vi.mock() blocks.
 */
import { vi } from 'vitest';
import { EventEmitter } from 'events';

/** Standard logger mock — captures all log calls for assertion. */
export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
}

/** Mock channel that records sent messages. */
export function createMockChannel() {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    setTyping: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    name: 'mock',
  };
}

/**
 * Mock container process with controllable stdin/stdout/stderr.
 * Usage:
 *   const proc = createMockContainerProcess();
 *   proc.emitOutput({ status: 'success', result: 'hello' });
 *   proc.emitClose(0);
 */
export function createMockContainerProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
    emitOutput: (data: Record<string, unknown>) => void;
    emitClose: (code: number) => void;
  };

  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.pid = 12345;

  proc.emitOutput = (data: Record<string, unknown>) => {
    const marker = '---NANOPILOT_OUTPUT_START---';
    const endMarker = '---NANOPILOT_OUTPUT_END---';
    proc.stdout.emit('data', Buffer.from(`${marker}\n${JSON.stringify(data)}\n${endMarker}\n`));
  };

  proc.emitClose = (code: number) => {
    proc.emit('close', code);
  };

  return proc;
}

/** Create a ContainerInput fixture. */
export function createContainerInput(overrides: Record<string, unknown> = {}) {
  return {
    prompt: '<context>Test message</context>',
    groupFolder: 'test_group',
    chatJid: 'tg:123',
    isMain: false,
    ...overrides,
  };
}

/** Create a ContainerOutput fixture. */
export function createContainerOutput(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    result: 'Agent response',
    newSessionId: 'sess-test-001',
    ...overrides,
  };
}

/** Create a RegisteredGroup fixture. */
export function createRegisteredGroup(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Group',
    folder: 'test_group',
    trigger: '@Andy',
    isMain: false,
    channelName: 'mock',
    ...overrides,
  };
}

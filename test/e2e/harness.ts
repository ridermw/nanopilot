/**
 * Reusable E2E test helpers — thin wrappers for seeding state and building fixtures.
 * No business logic here; tests compose these with real module calls.
 */
import { vi } from 'vitest';
import type { Channel, NewMessage } from '../../src/types.js';
import { _initTestDatabase, storeMessage, storeChatMetadata } from '../../src/db.js';

/** Create a mock channel that records sent messages */
export function createMockChannel(
  jidPrefix: string,
): Channel & { sent: Array<{ jid: string; text: string }> } {
  const sent: Array<{ jid: string; text: string }> = [];
  return {
    sent,
    name: `mock-${jidPrefix}`,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    ownsJid: (jid: string) => jid.startsWith(jidPrefix),
    isConnected: () => true,
    sendMessage: vi.fn(async (jid: string, text: string) => {
      sent.push({ jid, text });
    }),
  };
}

/** Initialize a fresh in-memory test database */
export function setupTestEnv(): void {
  _initTestDatabase();
}

/** Store a sequence of messages and return them with generated IDs */
export function ingestMessages(
  chatJid: string,
  messages: Array<Omit<NewMessage, 'id'>>,
): NewMessage[] {
  return messages.map((msg, i) => {
    const full: NewMessage = { ...msg, id: `msg-${Date.now()}-${i}` };
    storeMessage(full);
    return full;
  });
}

/** Create a standard test message with sensible defaults */
export function makeMessage(overrides: Partial<NewMessage> = {}): NewMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    chat_jid: 'test:group1',
    sender: 'user-1',
    sender_name: 'TestUser',
    content: 'test message',
    timestamp: new Date().toISOString(),
    is_from_me: false,
    is_bot_message: false,
    ...overrides,
  };
}

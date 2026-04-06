/**
 * Mocked E2E test — exercises the full message lifecycle with
 * mocked channel, container, and database. Always runs in CI.
 *
 * Flow: ingest message → trigger match → format XML → "spawn" container →
 * parse output → deliver response via mock channel
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessages, formatOutbound, routeOutbound } from '../../src/router.js';
import { _initTestDatabase, storeMessage, storeChatMetadata, getMessagesSince } from '../../src/db.js';
import type { Channel, NewMessage } from '../../src/types.js';

// Mock channel that records sends
function createMockChannel(jidPrefix: string): Channel & { sent: Array<{jid: string; text: string}> } {
  const sent: Array<{jid: string; text: string}> = [];
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

describe('E2E Mocked: Full message lifecycle', () => {
  let tgChannel: ReturnType<typeof createMockChannel>;
  let waChannel: ReturnType<typeof createMockChannel>;

  beforeEach(() => {
    _initTestDatabase();
    tgChannel = createMockChannel('tg:');
    waChannel = createMockChannel('wa:');
  });

  it('processes messages through the full pipeline with multi-channel routing and content escaping', async () => {
    // Step 1: Set up two chats on different channels
    storeChatMetadata('tg:group1', '2024-01-01T00:00:00Z', 'TG Group');
    storeChatMetadata('wa:group2', '2024-01-01T00:00:00Z', 'WA Group');

    // Step 2: Store messages including dangerous content
    const msg1: NewMessage = {
      id: 'msg-001',
      chat_jid: 'tg:group1',
      sender: 'user-1',
      sender_name: 'Alice',
      content: '@Bot help me with something',
      timestamp: '2024-01-01T12:00:00Z',
      is_from_me: false,
      is_bot_message: false,
    };
    const msg2: NewMessage = {
      id: 'msg-002',
      chat_jid: 'tg:group1',
      sender: 'user-2',
      sender_name: '<script>alert(1)</script>',
      content: 'a & b < c',
      timestamp: '2024-01-01T12:01:00Z',
      is_from_me: false,
      is_bot_message: false,
    };
    storeMessage(msg1);
    storeMessage(msg2);

    // Step 3: Retrieve and verify multiple messages
    const messages = getMessagesSince('tg:group1', '', 'UTC', 50, 'Bot');
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // Step 4: Format for container — verify XML escaping
    const xml = formatMessages(messages, 'UTC');
    expect(xml).toContain('<messages>');
    expect(xml).toContain('sender="Alice"');
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('a &amp; b &lt; c');

    // Step 5: Simulate container output with internal reasoning
    const containerOutput = {
      status: 'success' as const,
      result: 'Here is help! <internal>reasoning here</internal>',
      newSessionId: 'sess-123',
    };

    // Step 6: Format outbound — strip internal tags
    const cleaned = formatOutbound(containerOutput.result);
    expect(cleaned).toBe('Here is help!');
    expect(cleaned).not.toContain('<internal>');

    // Step 7: Route to correct channel among multiple
    await routeOutbound([tgChannel, waChannel], 'tg:group1', cleaned);

    // Step 8: Verify delivery to correct channel only
    expect(tgChannel.sent).toHaveLength(1);
    expect(waChannel.sent).toHaveLength(0);
    expect(tgChannel.sent[0].jid).toBe('tg:group1');
    expect(tgChannel.sent[0].text).toBe('Here is help!');

    // Step 9: Route to second channel
    await routeOutbound([tgChannel, waChannel], 'wa:group2', 'WA response');
    expect(waChannel.sent).toHaveLength(1);
    expect(waChannel.sent[0].text).toBe('WA response');
  });
});

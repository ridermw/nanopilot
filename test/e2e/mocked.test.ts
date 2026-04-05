/**
 * Mocked E2E test — exercises the full message lifecycle with
 * mocked channel, container, and database. Always runs in CI.
 *
 * Flow: ingest message → trigger match → format XML → "spawn" container →
 * parse output → deliver response via mock channel
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatMessages, formatOutbound, routeOutbound, findChannel } from '../../src/router.js';
import { escapeXml } from '../../src/router.js';
import { _initTestDatabase, storeMessage, storeChatMetadata, getMessagesSince } from '../../src/db.js';
import type { Channel, NewMessage, RegisteredGroup } from '../../src/types.js';

// Mock channel that records sends
function createMockChannel(jidPrefix: string): Channel & { sent: Array<{jid: string; text: string}> } {
  const sent: Array<{jid: string; text: string}> = [];
  return {
    sent,
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
  let channel: ReturnType<typeof createMockChannel>;

  beforeEach(() => {
    _initTestDatabase();
    channel = createMockChannel('tg:');
  });

  it('processes a message through the full pipeline', async () => {
    // Step 1: Store a chat and a message (simulates channel ingestion)
    storeChatMetadata('tg:group1', '2024-01-01T00:00:00Z', 'Test Group');
    const msg: NewMessage = {
      id: 'msg-001',
      chat_jid: 'tg:group1',
      sender: 'user-1',
      sender_name: 'Alice',
      content: '@Bot help me with something',
      timestamp: '2024-01-01T12:00:00Z',
      is_from_me: false,
      is_bot_message: false,
    };
    storeMessage(msg);

    // Step 2: Retrieve messages (simulates getNewMessages)
    const messages = getMessagesSince('tg:group1', '', 'UTC', 50, 'Bot');
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].content).toContain('@Bot');

    // Step 3: Format for container input
    const xml = formatMessages(messages, 'UTC');
    expect(xml).toContain('<messages>');
    expect(xml).toContain('sender="Alice"');
    expect(xml).toContain('@Bot help me');

    // Step 4: Simulate container output
    const containerOutput = {
      status: 'success' as const,
      result: 'Here is the help you need! <internal>reasoning here</internal>',
      newSessionId: 'sess-123',
    };

    // Step 5: Format outbound (strip internal tags)
    const cleaned = formatOutbound(containerOutput.result);
    expect(cleaned).toBe('Here is the help you need!');
    expect(cleaned).not.toContain('<internal>');

    // Step 6: Route to channel
    await routeOutbound([channel], 'tg:group1', cleaned);

    // Step 7: Verify delivery
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].jid).toBe('tg:group1');
    expect(channel.sent[0].text).toBe('Here is the help you need!');
  });

  it('blocks delivery when no channel owns the JID', async () => {
    const waChannel = createMockChannel('wa:'); // wrong prefix
    expect(() => routeOutbound([waChannel], 'tg:group1', 'test')).toThrow(
      'No channel for JID',
    );
  });

  it('handles empty agent response gracefully', () => {
    const result = formatOutbound('<internal>only thinking</internal>');
    expect(result).toBe('');
    // If empty, we wouldn't route — verified by skipping routeOutbound
  });

  it('multi-turn: messages accumulate and are formatted together', () => {
    storeChatMetadata('tg:group1', '2024-01-01T00:00:00Z');
    storeMessage({
      id: 'msg-1',
      chat_jid: 'tg:group1',
      sender: 'user-1',
      sender_name: 'Alice',
      content: 'First message',
      timestamp: '2024-01-01T12:00:00Z',
      is_from_me: false,
      is_bot_message: false,
    });
    storeMessage({
      id: 'msg-2',
      chat_jid: 'tg:group1',
      sender: 'user-2',
      sender_name: 'Bob',
      content: 'Second message',
      timestamp: '2024-01-01T12:01:00Z',
      is_from_me: false,
      is_bot_message: false,
    });

    const messages = getMessagesSince('tg:group1', '', 'UTC', 50, 'Bot');
    const xml = formatMessages(messages, 'UTC');

    expect(xml).toContain('Alice');
    expect(xml).toContain('Bob');
    expect(xml).toContain('First message');
    expect(xml).toContain('Second message');
  });

  it('XML-escapes dangerous content in messages', () => {
    storeChatMetadata('tg:group1', '2024-01-01T00:00:00Z');
    storeMessage({
      id: 'msg-xss',
      chat_jid: 'tg:group1',
      sender: 'attacker',
      sender_name: '<script>alert(1)</script>',
      content: 'a & b < c',
      timestamp: '2024-01-01T12:00:00Z',
      is_from_me: false,
      is_bot_message: false,
    });

    const messages = getMessagesSince('tg:group1', '', 'UTC', 50, 'Bot');
    const xml = formatMessages(messages, 'UTC');

    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('a &amp; b &lt; c');
  });
});

describe('E2E Mocked: Channel routing', () => {
  it('routes to correct channel among multiple', async () => {
    const tgChannel = createMockChannel('tg:');
    const waChannel = createMockChannel('wa:');

    await routeOutbound([tgChannel, waChannel], 'tg:123', 'for telegram');
    await routeOutbound([tgChannel, waChannel], 'wa:456', 'for whatsapp');

    expect(tgChannel.sent).toHaveLength(1);
    expect(waChannel.sent).toHaveLength(1);
    expect(tgChannel.sent[0].text).toBe('for telegram');
    expect(waChannel.sent[0].text).toBe('for whatsapp');
  });

  it('findChannel returns correct channel', () => {
    const tg = createMockChannel('tg:');
    const wa = createMockChannel('wa:');

    expect(findChannel([tg, wa], 'tg:123')).toBe(tg);
    expect(findChannel([tg, wa], 'wa:456')).toBe(wa);
    expect(findChannel([tg, wa], 'slack:789')).toBeUndefined();
  });
});

/**
 * Chaos tests — verify resilience under hostile conditions.
 * These test error recovery, malformed input, and boundary conditions
 * that are NOT covered by unit tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _initTestDatabase, storeMessage, storeChatMetadata, getMessagesSince, updateTask, deleteTask } from '../../src/db.js';
import { formatOutbound } from '../../src/router.js';
import { validateMount, _resetMountSecurityForTests } from '../../src/mount-security.js';

describe('Chaos: Database resilience', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('handles storing messages with extremely long content', () => {
    storeChatMetadata('tg:chaos', '2024-01-01T00:00:00Z');
    const longContent = 'x'.repeat(100_000);
    storeMessage({
      id: 'msg-long',
      chat_jid: 'tg:chaos',
      sender: 'user',
      sender_name: 'User',
      content: longContent,
      timestamp: '2024-01-01T12:00:00Z',
      is_from_me: false,
      is_bot_message: false,
    });

    const msgs = getMessagesSince('tg:chaos', '', 'UTC', 50, 'Bot');
    expect(msgs[0].content.length).toBe(100_000);
  });

  it('handles messages with unicode and emoji', () => {
    storeChatMetadata('tg:chaos', '2024-01-01T00:00:00Z');
    storeMessage({
      id: 'msg-emoji',
      chat_jid: 'tg:chaos',
      sender: 'user',
      sender_name: '🤖 Bot',
      content: '你好世界 🌍 مرحبا',
      timestamp: '2024-01-01T12:00:00Z',
      is_from_me: false,
      is_bot_message: false,
    });

    const msgs = getMessagesSince('tg:chaos', '', 'UTC', 50, 'Bot');
    expect(msgs[0].content).toContain('🌍');
    expect(msgs[0].sender_name).toContain('🤖');
  });

  it('deleting non-existent task does not throw', () => {
    expect(() => deleteTask('nonexistent')).not.toThrow();
  });

  it('updating non-existent task does not throw', () => {
    expect(() => updateTask('nonexistent', { status: 'paused' })).not.toThrow();
  });
});

describe('Chaos: XML formatting resilience', () => {
  it('formatOutbound with malformed internal tag (unclosed)', () => {
    const text = 'before <internal>never closed';
    // The regex uses [\s\S]*? so it won't match without closing tag
    expect(formatOutbound(text)).toBe('before <internal>never closed');
  });
});

describe('Chaos: Mount security resilience', () => {
  beforeEach(() => {
    _resetMountSecurityForTests();
  });

  it('rejects path with null bytes', () => {
    const result = validateMount(
      { hostPath: '/tmp/test\0evil', containerPath: '/data', readOnly: true },
      false,
    );
    expect(result.allowed).toBe(false);
  });
});

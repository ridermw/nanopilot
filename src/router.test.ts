import { describe, it, expect, vi } from 'vitest';
import {
  escapeXml,
  formatMessages,
  stripInternalTags,
  formatOutbound,
  routeOutbound,
  findChannel,
} from './router.js';
import { Channel, NewMessage } from './types.js';

describe('router', () => {
  describe('escapeXml', () => {
    it('escapes ampersands', () => {
      expect(escapeXml('a & b')).toBe('a &amp; b');
    });

    it('escapes angle brackets', () => {
      expect(escapeXml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes double quotes', () => {
      expect(escapeXml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('returns empty string for falsy input', () => {
      expect(escapeXml('')).toBe('');
    });

    it('passes through safe strings unchanged', () => {
      expect(escapeXml('hello world')).toBe('hello world');
    });

    it('handles multiple special characters', () => {
      expect(escapeXml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    });
  });

  describe('formatMessages', () => {
    it('formats single message with context header', () => {
      const msgs: NewMessage[] = [{
        id: '1',
        chat_jid: 'test@g.us',
        sender: '123',
        sender_name: 'Alice',
        content: 'Hello',
        timestamp: '2024-01-01T12:00:00Z',
        is_from_me: false,
        is_bot_message: false,
      }];

      const result = formatMessages(msgs, 'UTC');

      expect(result).toContain('<context timezone="UTC"');
      expect(result).toContain('<messages>');
      expect(result).toContain('sender="Alice"');
      expect(result).toContain('Hello');
      expect(result).toContain('</messages>');
    });

    it('includes reply attributes when present', () => {
      const msgs: NewMessage[] = [{
        id: '1',
        chat_jid: 'test@g.us',
        sender: '123',
        sender_name: 'Alice',
        content: 'Reply',
        timestamp: '2024-01-01T12:00:00Z',
        is_from_me: false,
        is_bot_message: false,
        reply_to_message_id: 'msg-0',
        reply_to_sender_name: 'Bob',
        reply_to_message_content: 'Original',
      }];

      const result = formatMessages(msgs, 'UTC');

      expect(result).toContain('reply_to="msg-0"');
      expect(result).toContain('<quoted_message from="Bob">Original</quoted_message>');
    });

    it('escapes XML special chars in message content', () => {
      const msgs: NewMessage[] = [{
        id: '1',
        chat_jid: 'test@g.us',
        sender: '123',
        sender_name: 'Alice & Bob',
        content: '1 < 2',
        timestamp: '2024-01-01T12:00:00Z',
        is_from_me: false,
        is_bot_message: false,
      }];

      const result = formatMessages(msgs, 'UTC');

      expect(result).toContain('Alice &amp; Bob');
      expect(result).toContain('1 &lt; 2');
    });
  });

  describe('stripInternalTags', () => {
    it('removes <internal> blocks', () => {
      const input = 'visible <internal>hidden reasoning</internal> text';
      expect(stripInternalTags(input)).toBe('visible  text');
    });

    it('removes multiline internal blocks', () => {
      const input = 'start <internal>\nline1\nline2\n</internal> end';
      expect(stripInternalTags(input)).toBe('start  end');
    });

    it('removes multiple internal blocks', () => {
      const input = '<internal>a</internal> visible <internal>b</internal>';
      expect(stripInternalTags(input)).toBe('visible');
    });

    it('returns string unchanged when no internal tags', () => {
      expect(stripInternalTags('just text')).toBe('just text');
    });
  });

  describe('formatOutbound', () => {
    it('strips internal tags and returns clean text', () => {
      expect(formatOutbound('Hello <internal>reason</internal> world')).toBe('Hello  world');
    });

    it('returns empty string when only internal content', () => {
      expect(formatOutbound('<internal>only reasoning</internal>')).toBe('');
    });

    it('returns text unchanged when no tags', () => {
      expect(formatOutbound('plain text')).toBe('plain text');
    });
  });

  describe('routeOutbound', () => {
    it('routes to the correct channel', async () => {
      const sendMessage = vi.fn(async () => {});
      const channels: Channel[] = [
        {
          sendMessage,
          connect: vi.fn(async () => {}),
          disconnect: vi.fn(async () => {}),
          ownsJid: (jid: string) => jid.includes('tg:'),
          isConnected: () => true,
        },
      ];

      await routeOutbound(channels, 'tg:123', 'hello');

      expect(sendMessage).toHaveBeenCalledWith('tg:123', 'hello');
    });

    it('throws when no channel owns the JID', () => {
      const channels: Channel[] = [
        {
          sendMessage: vi.fn(async () => {}),
          connect: vi.fn(async () => {}),
          disconnect: vi.fn(async () => {}),
          ownsJid: () => false,
          isConnected: () => true,
        },
      ];

      expect(() => routeOutbound(channels, 'unknown@jid', 'test')).toThrow(
        'No channel for JID',
      );
    });

    it('skips disconnected channels', () => {
      const channels: Channel[] = [
        {
          sendMessage: vi.fn(async () => {}),
          connect: vi.fn(async () => {}),
          disconnect: vi.fn(async () => {}),
          ownsJid: () => true,
          isConnected: () => false, // disconnected
        },
      ];

      expect(() => routeOutbound(channels, 'test@jid', 'test')).toThrow(
        'No channel for JID',
      );
    });
  });

  describe('findChannel', () => {
    it('returns the channel that owns the JID', () => {
      const ch1: Channel = {
        sendMessage: vi.fn(async () => {}),
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        ownsJid: (jid: string) => jid === 'match@jid',
      };

      const result = findChannel([ch1], 'match@jid');
      expect(result).toBe(ch1);
    });

    it('returns undefined when no channel matches', () => {
      const result = findChannel([], 'any@jid');
      expect(result).toBeUndefined();
    });
  });
});

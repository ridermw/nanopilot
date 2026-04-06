/**
 * Mocked E2E tests — exercise the full message lifecycle with
 * mocked channel, container, and database. Always runs in CI.
 *
 * Flow: ingest message → trigger match → format XML → "spawn" container →
 * parse output → deliver response via mock channel
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { formatMessages, formatOutbound, routeOutbound } from '../../src/router.js';
import {
  storeMessage,
  storeChatMetadata,
  getMessagesSince,
  createTask,
  getTaskById,
  updateTaskAfterRun,
  logTaskRun,
  getSession,
  setSession,
  deleteSession,
  setRegisteredGroup,
  getRegisteredGroup,
} from '../../src/db.js';
import type { NewMessage } from '../../src/types.js';
import { isSenderAllowed, shouldDropMessage } from '../../src/sender-allowlist.js';
import type { SenderAllowlistConfig } from '../../src/sender-allowlist.js';
import { getTriggerPattern } from '../../src/config.js';
import { createMockChannel, setupTestEnv, makeMessage, ingestMessages } from './harness.js';

describe('E2E Mocked: Full message lifecycle', () => {
  let tgChannel: ReturnType<typeof createMockChannel>;
  let waChannel: ReturnType<typeof createMockChannel>;

  beforeEach(() => {
    setupTestEnv();
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

    // Step 3: Retrieve and verify multiple messages (botPrefix='Bot')
    const messages = getMessagesSince('tg:group1', '', 'Bot', 50);
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

  it('filters denied senders through allowlist before pipeline processing', async () => {
    // Allowlist: only user-1 is allowed in tg:secure; drop mode discards entirely
    const cfg: SenderAllowlistConfig = {
      default: { allow: '*', mode: 'trigger' },
      chats: {
        'tg:secure': { allow: ['user-1'], mode: 'drop' },
      },
      logDenied: false,
    };

    storeChatMetadata('tg:secure', '2024-01-01T00:00:00Z', 'Secure Group');

    // Ingest messages from allowed and denied senders
    const allowed = makeMessage({
      id: 'msg-allow-1',
      chat_jid: 'tg:secure',
      sender: 'user-1',
      sender_name: 'Trusted',
      content: 'I should pass through',
      timestamp: '2024-01-01T12:00:00Z',
    });
    const denied = makeMessage({
      id: 'msg-deny-1',
      chat_jid: 'tg:secure',
      sender: 'user-intruder',
      sender_name: 'Intruder',
      content: 'I should be dropped',
      timestamp: '2024-01-01T12:01:00Z',
    });
    storeMessage(allowed);
    storeMessage(denied);

    // Verify allowlist decisions
    expect(isSenderAllowed('tg:secure', 'user-1', cfg)).toBe(true);
    expect(isSenderAllowed('tg:secure', 'user-intruder', cfg)).toBe(false);
    expect(shouldDropMessage('tg:secure', cfg)).toBe(true);

    // In drop mode, denied messages never reach the pipeline.
    // Simulate the real path: filter at ingest time, then process survivors.
    const allMessages = getMessagesSince('tg:secure', '', 'Bot', 50);
    const surviving = allMessages.filter((m) =>
      isSenderAllowed('tg:secure', m.sender, cfg),
    );
    expect(surviving).toHaveLength(1);
    expect(surviving[0].sender).toBe('user-1');

    // Format and route only surviving messages
    const xml = formatMessages(surviving, 'UTC');
    expect(xml).toContain('sender="Trusted"');
    expect(xml).not.toContain('Intruder');

    const cleaned = formatOutbound('Allowed response');
    await routeOutbound([tgChannel], 'tg:secure', cleaned);
    expect(tgChannel.sent).toHaveLength(1);
    expect(tgChannel.sent[0].text).toBe('Allowed response');
  });

  it('runs a scheduled task through its full lifecycle (create → execute → log)', async () => {
    // Register a group so the task has a home
    storeChatMetadata('tg:tasks', '2024-01-01T00:00:00Z', 'Task Group');
    setRegisteredGroup('tg:tasks', {
      name: 'Task Group',
      folder: 'task-group',
      trigger: '@Bot',
      added_at: '2024-01-01T00:00:00Z',
    });

    // Create a scheduled task
    const taskId = 'task-daily-report';
    createTask({
      id: taskId,
      group_folder: 'task-group',
      chat_jid: 'tg:tasks',
      prompt: 'Generate daily report',
      schedule_type: 'once',
      schedule_value: '2024-06-01T09:00:00Z',
      context_mode: 'isolated',
      next_run: '2024-06-01T09:00:00Z',
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
    });

    // Verify task is stored
    const task = getTaskById(taskId);
    expect(task).toBeDefined();
    expect(task!.prompt).toBe('Generate daily report');
    expect(task!.status).toBe('active');

    // Simulate execution: container returns a result
    const containerResult = 'Daily report: all systems nominal.';
    const cleaned = formatOutbound(containerResult);
    expect(cleaned).toBe(containerResult);

    // Update task after run (once-type → next_run null → status completed)
    updateTaskAfterRun(taskId, null, cleaned);
    const afterRun = getTaskById(taskId);
    expect(afterRun!.status).toBe('completed');
    expect(afterRun!.last_result).toBe(containerResult);

    // Log the run
    logTaskRun({
      task_id: taskId,
      run_at: new Date().toISOString(),
      duration_ms: 1500,
      status: 'success',
      result: containerResult,
      error: null,
    });

    // Verify the group still exists and route the result
    const group = getRegisteredGroup('tg:tasks');
    expect(group).toBeDefined();
    expect(group!.folder).toBe('task-group');

    await routeOutbound([tgChannel], 'tg:tasks', cleaned);
    expect(tgChannel.sent).toHaveLength(1);
    expect(tgChannel.sent[0].text).toBe(containerResult);
  });

  it('isolates messages between groups across different channels', async () => {
    // Set up two completely separate groups
    storeChatMetadata('tg:alpha', '2024-01-01T00:00:00Z', 'Alpha');
    storeChatMetadata('wa:beta', '2024-01-01T00:00:00Z', 'Beta');

    // Ingest messages into each group
    ingestMessages('tg:alpha', [
      {
        chat_jid: 'tg:alpha',
        sender: 'user-a',
        sender_name: 'AlphaUser',
        content: 'Alpha secret message',
        timestamp: '2024-01-01T12:00:00Z',
        is_from_me: false,
        is_bot_message: false,
      },
    ]);
    ingestMessages('wa:beta', [
      {
        chat_jid: 'wa:beta',
        sender: 'user-b',
        sender_name: 'BetaUser',
        content: 'Beta secret message',
        timestamp: '2024-01-01T12:00:00Z',
        is_from_me: false,
        is_bot_message: false,
      },
    ]);

    // Retrieve messages for each group — verify isolation
    const alphaMessages = getMessagesSince('tg:alpha', '', 'Bot', 50);
    const betaMessages = getMessagesSince('wa:beta', '', 'Bot', 50);

    expect(alphaMessages).toHaveLength(1);
    expect(betaMessages).toHaveLength(1);
    expect(alphaMessages[0].content).toBe('Alpha secret message');
    expect(betaMessages[0].content).toBe('Beta secret message');

    // Format each group's messages independently
    const alphaXml = formatMessages(alphaMessages, 'UTC');
    const betaXml = formatMessages(betaMessages, 'UTC');
    expect(alphaXml).toContain('AlphaUser');
    expect(alphaXml).not.toContain('BetaUser');
    expect(betaXml).toContain('BetaUser');
    expect(betaXml).not.toContain('AlphaUser');

    // Route responses to correct channels
    await routeOutbound([tgChannel, waChannel], 'tg:alpha', 'Alpha reply');
    await routeOutbound([tgChannel, waChannel], 'wa:beta', 'Beta reply');

    expect(tgChannel.sent).toHaveLength(1);
    expect(tgChannel.sent[0].text).toBe('Alpha reply');
    expect(waChannel.sent).toHaveLength(1);
    expect(waChannel.sent[0].text).toBe('Beta reply');
  });

  it('handles empty and null content messages gracefully', async () => {
    storeChatMetadata('tg:empty', '2024-01-01T00:00:00Z', 'Empty Group');

    // Store messages with various empty content + one valid message
    const valid = makeMessage({
      id: 'msg-valid',
      chat_jid: 'tg:empty',
      content: 'I have content',
      timestamp: '2024-01-01T12:00:00Z',
    });
    const empty = makeMessage({
      id: 'msg-empty',
      chat_jid: 'tg:empty',
      content: '',
      timestamp: '2024-01-01T12:01:00Z',
    });
    storeMessage(valid);
    storeMessage(empty);

    // getMessagesSince filters out empty content (SQL: content != '' AND content IS NOT NULL)
    const messages = getMessagesSince('tg:empty', '', 'Bot', 50);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('I have content');

    // formatOutbound with empty string returns empty
    expect(formatOutbound('')).toBe('');

    // Full pipeline with the surviving valid message
    const xml = formatMessages(messages, 'UTC');
    expect(xml).toContain('I have content');

    const cleaned = formatOutbound('Reply to valid');
    await routeOutbound([tgChannel], 'tg:empty', cleaned);
    expect(tgChannel.sent).toHaveLength(1);
    expect(tgChannel.sent[0].text).toBe('Reply to valid');
  });

  it('matches trigger patterns correctly for non-main groups', async () => {
    storeChatMetadata('tg:triggered', '2024-01-01T00:00:00Z', 'Triggered Group');

    // Build a trigger pattern for this group
    const trigger = getTriggerPattern('@Helper');

    // Store messages — some match trigger, some don't
    const matching = makeMessage({
      id: 'msg-trigger-yes',
      chat_jid: 'tg:triggered',
      content: '@Helper what time is it?',
      timestamp: '2024-01-01T12:00:00Z',
    });
    const notMatching = makeMessage({
      id: 'msg-trigger-no',
      chat_jid: 'tg:triggered',
      content: 'just chatting, no trigger here',
      timestamp: '2024-01-01T12:01:00Z',
    });
    const partialMatch = makeMessage({
      id: 'msg-trigger-partial',
      chat_jid: 'tg:triggered',
      content: 'I mentioned @Helperton not the bot',
      timestamp: '2024-01-01T12:02:00Z',
    });
    storeMessage(matching);
    storeMessage(notMatching);
    storeMessage(partialMatch);

    // Retrieve all messages from DB
    const allMessages = getMessagesSince('tg:triggered', '', 'Bot', 50);
    expect(allMessages).toHaveLength(3);

    // Apply trigger filter (as non-main group would)
    const triggered = allMessages.filter((m) => trigger.test(m.content));
    expect(triggered).toHaveLength(1);
    expect(triggered[0].content).toBe('@Helper what time is it?');

    // '@Helperton' should NOT match due to word boundary
    expect(trigger.test('@Helperton not the bot')).toBe(false);

    // Format and route triggered messages only
    const xml = formatMessages(triggered, 'UTC');
    expect(xml).toContain('@Helper what time is it?');
    expect(xml).not.toContain('just chatting');

    const cleaned = formatOutbound('It is 12:00 UTC');
    await routeOutbound([tgChannel], 'tg:triggered', cleaned);
    expect(tgChannel.sent).toHaveLength(1);
  });

  it('recovers session state after simulated error (cursor rollback)', () => {
    // Set up a group with a session
    storeChatMetadata('tg:recover', '2024-01-01T00:00:00Z', 'Recovery Group');
    setRegisteredGroup('tg:recover', {
      name: 'Recovery Group',
      folder: 'recovery',
      trigger: '@Bot',
      added_at: '2024-01-01T00:00:00Z',
    });

    // Store initial session
    setSession('recovery', 'session-good');
    expect(getSession('recovery')).toBe('session-good');

    // Store some messages before "error"
    ingestMessages('tg:recover', [
      {
        chat_jid: 'tg:recover',
        sender: 'user-1',
        sender_name: 'User',
        content: 'Message before error',
        timestamp: '2024-01-01T12:00:00Z',
        is_from_me: false,
        is_bot_message: false,
      },
    ]);

    // Simulate stale/bad session — container would fail, orchestrator deletes session
    setSession('recovery', 'session-stale-bad');
    expect(getSession('recovery')).toBe('session-stale-bad');

    // Recovery: delete stale session (as orchestrator does on container error)
    deleteSession('recovery');
    expect(getSession('recovery')).toBeUndefined();

    // Messages survive the session reset
    const messages = getMessagesSince('tg:recover', '', 'Bot', 50);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Message before error');

    // New session can be established
    setSession('recovery', 'session-fresh');
    expect(getSession('recovery')).toBe('session-fresh');

    // Group registration survives too
    const group = getRegisteredGroup('tg:recover');
    expect(group).toBeDefined();
    expect(group!.folder).toBe('recovery');

    // Messages can still be formatted for the new session
    const xml = formatMessages(messages, 'UTC');
    expect(xml).toContain('Message before error');
  });

  it('excludes bot messages from pipeline processing', async () => {
    storeChatMetadata('tg:botfilter', '2024-01-01T00:00:00Z', 'Bot Filter Group');

    // Store a mix of human and bot messages
    const human1 = makeMessage({
      id: 'msg-human-1',
      chat_jid: 'tg:botfilter',
      sender: 'user-1',
      sender_name: 'Human',
      content: '@Bot help me',
      timestamp: '2024-01-01T12:00:00Z',
      is_bot_message: false,
    });
    const botReply = makeMessage({
      id: 'msg-bot-1',
      chat_jid: 'tg:botfilter',
      sender: 'bot',
      sender_name: 'Bot',
      content: 'Here is help!',
      timestamp: '2024-01-01T12:01:00Z',
      is_bot_message: true,
    });
    const human2 = makeMessage({
      id: 'msg-human-2',
      chat_jid: 'tg:botfilter',
      sender: 'user-2',
      sender_name: 'Human2',
      content: 'Thanks!',
      timestamp: '2024-01-01T12:02:00Z',
      is_bot_message: false,
    });
    // Also test the legacy prefix-based detection
    const legacyBot = makeMessage({
      id: 'msg-legacy-bot',
      chat_jid: 'tg:botfilter',
      sender: 'bot',
      sender_name: 'Bot',
      content: 'Bot: legacy format response',
      timestamp: '2024-01-01T12:03:00Z',
      is_bot_message: false, // not flagged, but content prefix matches
    });
    storeMessage(human1);
    storeMessage(botReply);
    storeMessage(human2);
    storeMessage(legacyBot);

    // getMessagesSince filters: is_bot_message=0 AND content NOT LIKE 'Bot:%'
    const messages = getMessagesSince('tg:botfilter', '', 'Bot', 50);
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.id)).toEqual(['msg-human-1', 'msg-human-2']);

    // Format only human messages
    const xml = formatMessages(messages, 'UTC');
    expect(xml).toContain('sender="Human"');
    expect(xml).toContain('sender="Human2"');
    expect(xml).not.toContain('Here is help!');
    expect(xml).not.toContain('legacy format');

    // Route response
    const cleaned = formatOutbound('Response to humans only');
    await routeOutbound([tgChannel], 'tg:botfilter', cleaned);
    expect(tgChannel.sent).toHaveLength(1);
    expect(tgChannel.sent[0].text).toBe('Response to humans only');
  });
});

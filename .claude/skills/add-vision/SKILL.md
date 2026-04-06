---
name: add-vision
description: Add generic image vision to NanoPilot. Channel-agnostic pipeline — images flow from any channel through a shared attachment layer to the Copilot SDK as blob attachments. Includes Telegram support out of the box.
---

# Generic Image Vision Skill

Adds a channel-agnostic image pipeline so NanoPilot agents can see and understand images from any messaging channel. Telegram support is included; other channels plug in by implementing the same attachment interface.

## Architecture

```
Channel (Telegram/WhatsApp/Slack)
  → downloads image, creates ImageAttachment { data: Buffer, mimeType }
  → passes via NewMessage.attachments[]

Host (src/index.ts)
  → storeMessage() persists image to groups/{folder}/attachments/
  → stores metadata in message_attachments table
  → loads attachments when building ContainerInput.images[]

Container (agent-runner)
  → passes images as Copilot SDK blob attachments
  → session.sendAndWait({ prompt, attachments: [{ type: "blob", data, mimeType }] })
```

## Phase 1: Pre-flight

1. Check if `message_attachments` table exists in `store/messages.db` — if so, skip to Phase 3
2. If Telegram channel is installed (`src/channels/telegram.ts` exists), Telegram photo support will be added in Phase 2.7. If not installed, skip that step — the core pipeline works without any specific channel.
3. Verify Node.js 18+ (for native `fetch()` used to download files from channel APIs)

## Phase 2: Apply Code Changes

### 2.1 Core types (`src/types.ts`)

Add to `NewMessage`:
```ts
attachments?: ImageAttachment[];
```

Add new type:
```ts
export interface ImageAttachment {
  data: Buffer;       // raw image bytes after download (transient, not persisted)
  mimeType: string;   // image/jpeg, image/png, image/webp, image/gif
  filename?: string;  // optional original filename
}
```

### 2.2 Database layer (`src/db.ts`)

Add `message_attachments` table in `createSchema()`:
```sql
CREATE TABLE IF NOT EXISTS message_attachments (
  message_id TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  idx INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  PRIMARY KEY (message_id, chat_jid, idx),
  FOREIGN KEY (message_id, chat_jid) REFERENCES messages(id, chat_jid)
);
```

Add functions:
- `storeAttachment(messageId, chatJid, idx, mimeType, filePath)` — insert metadata row
- `getAttachmentsForMessages(messages: Array<{messageId: string, chatJid: string}>): Map<string, { mimeType: string, filePath: string }[]>` — bulk load keyed by `${messageId}:${chatJid}`

  This accepts messages from multiple chats because `getNewMessages()` returns across all registered groups in one batch.

Modify `storeMessage()`:
- Add optional `groupFolder?: string` parameter
- When `msg.attachments` exist and `groupFolder` is provided:
  - Create `groups/{groupFolder}/attachments/` directory
  - Save each attachment to `groups/{groupFolder}/attachments/{messageId}_{idx}.{ext}`
  - Call `storeAttachment()` for each

**Critical:** Update the `onMessage` handler in `src/index.ts` to pass the group folder into `storeMessage()`. Look up the folder from the registered group: `registeredGroups[chatJid]?.folder` and pass it as the `groupFolder` argument.

**Critical:** Modify `getNewMessages()` and `getMessagesSince()` queries — change:
```sql
AND content != '' AND content IS NOT NULL
```
to:
```sql
AND ((content != '' AND content IS NOT NULL) OR EXISTS (
  SELECT 1 FROM message_attachments ma
  WHERE ma.message_id = messages.id AND ma.chat_jid = messages.chat_jid
))
```
This allows image-only messages (no caption) through the pipeline.

### 2.3 Router (`src/router.ts`)

Modify `formatMessages()` to accept optional attachment metadata. When a message has attachments, include in the XML:
```xml
<message sender="Name" time="12:00"><attachment type="image" mime="image/jpeg" />Hello</message>
```

### 2.4 Container input (`src/container-runner.ts`)

Add to `ContainerInput`:
```ts
images?: { base64: string; mimeType: string; messageId: string }[];
```

### 2.5 Index orchestration (`src/index.ts`)

After calling `getMessagesSince()` / `getNewMessages()`, also call `getAttachmentsForMessages()` with `messages.map(m => ({ messageId: m.id, chatJid: m.chat_jid }))`. Read each file from disk, base64 encode, and pass as `images` in `ContainerInput`.

### 2.6 Agent runner (`container/agent-runner/src/index.ts`)

Update `ContainerInput` interface to include `images`.

When images are present on the first turn, map them to Copilot SDK blob attachments:
```ts
const attachments = (containerInput.images || []).map(img => ({
  type: 'blob' as const,
  data: img.base64,
  mimeType: img.mimeType,
  displayName: `image_${img.messageId}`,
}));

await session.sendAndWait({ prompt, attachments });
```

### 2.7 Telegram channel (`src/channels/telegram.ts`)

Add `message:photo` handler:
- Get highest resolution photo: `msg.photo[msg.photo.length - 1]`
- Download via `bot.api.getFile()` + `fetch()`
- Determine MIME type from file extension
- Create `NewMessage` with `content: msg.caption || ''` and `attachments: [{ data: buffer, mimeType }]`
- Call `onMessage()`

Add `message:document` handler for image documents:
- Check `doc.mime_type?.startsWith('image/')` — ignore non-images
- Same download + attachment logic

### 2.8 Build and validate

```bash
npm run build
npx vitest run
```

All existing tests must pass. Add new tests for:
- Attachment storage/retrieval in db.ts
- Photo handling in telegram.ts (mock grammy `getFile` + `fetch`)
- Images in ContainerInput

## Phase 3: Configure

1. Rebuild the container:
   ```bash
   ./container/build.sh
   ```

2. Clear agent-runner source caches:
   ```bash
   rm -rf data/sessions/*/agent-runner-src/
   ```

3. Restart the service:
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.nanopilot    # macOS
   systemctl --user restart nanopilot                     # Linux
   ```

## Phase 4: Verify

1. Send an image in a registered Telegram chat (group or DM)
2. Check the agent responds with understanding of the image content
3. Send an image with a caption — verify both caption text and image are processed
4. Check logs:
   ```bash
   tail -50 groups/*/logs/container-*.log
   ```

## Adding vision to other channels

To add image support to another channel (WhatsApp, Slack, Discord):

1. In the channel's message handler, listen for image events
2. Download the image to a `Buffer`
3. Set `msg.attachments = [{ data: buffer, mimeType: 'image/jpeg' }]`
4. Call `onMessage(jid, msg)` as normal

The core pipeline handles everything else — persistence, encoding, passing to the agent.

## Design decisions

- **No `sharp` dependency** — The Copilot SDK auto-resizes oversized images. Skip the native-binding complexity.
- **Files on disk, not blobs in DB** — Attachment bytes stored as files in `groups/{folder}/attachments/`, only metadata in SQLite. Keeps DB small.
- **Buffer is transient** — `NewMessage.attachments[].data` is only held in memory during the channel→store handoff. After `storeMessage()`, the Buffer can be GC'd.
- **SDK blob attachments** — Uses `{ type: "blob", data: base64String, mimeType }` in `session.sendAndWait()`. Native multimodal, no prompt hacks.

## Troubleshooting

- **Image-only messages not reaching agent**: Check that the `message_attachments` table exists and the DB query was updated to allow attachment-only messages.
- **Telegram download fails**: Bot must have file access. Check `bot.api.getFile()` response. Large files (>20MB) are not supported by Telegram Bot API.
- **Agent doesn't mention image**: Check container logs for attachment count. Verify agent-runner source cache was cleared after rebuild.
- **"Cannot find module sharp"**: This skill does NOT use sharp. If you see this error, you may have the old `whatsapp-vision` skill applied. They are independent.

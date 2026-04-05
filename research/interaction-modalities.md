# Interaction Modalities for NanoPilot / Claw-Family AI Agents

## Executive Summary

The landscape of AI agent interaction modalities has expanded dramatically. NanoPilot currently supports **7 modalities** (Telegram, WhatsApp, Slack, Discord, Gmail, Emacs, and the Claw CLI). Competitors like OpenClaw support **50+ channels** including Signal, iMessage, Matrix, IRC, WebChat, and voice telephony. This report maps the full taxonomy of interaction modalities — from messaging platforms to novel surfaces like IDE plugins, git hooks, Apple Shortcuts, macOS Spotlight, car dashboards, and wearables — and identifies **which NanoPilot already covers, where gaps exist, and which modalities offer the highest novelty and developer-specific value**.

The key finding: NanoPilot has strong coverage of **messaging channels** and a unique **CLI tool (claw)**, but is missing critical **developer-workflow modalities** (IDE integration, git hook triggers, CI/CD pipeline agents, REPL/notebook integration) and **novel ambient surfaces** (Raycast/Spotlight, iOS Shortcuts, webhooks/API endpoints, watchOS, CarPlay). The biggest wins for differentiation are in **development-specific modalities** that competitors largely ignore.

---

## Methodology

Research was conducted across:
- NanoPilot source code analysis (skills, channels, container system)[^1]
- OpenClaw official documentation and feature set[^2]
- NanoClaw documentation and comparison guides[^3]
- Industry surveys of AI CLI tools (Claude Code, Codex CLI, Aider, Gemini CLI, OpenCode)[^4]
- Web research on emerging interaction surfaces (Raycast, Apple Shortcuts, CarPlay, AR glasses, MCP protocol)[^5]

---

## 1. Full Taxonomy of Interaction Modalities

### Category A: Messaging Channels (Conversational)

These are the "classic" modalities where users interact via natural language in a chat interface.

| Modality | NanoPilot | OpenClaw | NanoClaw | Notes |
|----------|-----------|----------|----------|-------|
| **WhatsApp** | ✅ skill | ✅ | ✅ | Dominant mobile channel. NanoPilot uses Baileys library[^6] |
| **Telegram** | ✅ core | ✅ | ✅ | Grammy-based in NanoPilot. Supports swarm (multi-bot) via skill[^7] |
| **Slack** | ✅ skill | ✅ | ❌ | Socket Mode (no public URL). Enterprise-critical[^8] |
| **Discord** | ✅ skill | ✅ | ❌ | Community-oriented. Bot identity in channels[^9] |
| **Gmail** | ✅ skill | ✅ | ❌ | Can be tool or full channel. GCP OAuth setup[^10] |
| **Signal** | ❌ | ✅ | ❌ | E2E encrypted. Requires signal-cli. High privacy value[^11] |
| **iMessage** | ❌ | ✅ | ❌ | Via BlueBubbles REST API. macOS hardware required[^12] |
| **Matrix** | ❌ | ✅ | ❌ | Federated, E2E, widget/canvas support[^13] |
| **IRC** | ❌ | ✅ | ❌ | Classic dev platform. Fast, scriptable, no media[^14] |
| **Microsoft Teams** | ❌ | ✅ | ❌ | Enterprise standard. Bot Framework integration[^15] |
| **WebChat** | ❌ | ✅ | ❌ | WebSocket-based. Quick demo/test UI[^16] |
| **Feishu/Lark** | ❌ | ✅ | ❌ | Popular in APAC enterprise[^17] |
| **X (Twitter)** | ✅ skill | ✅ | ❌ | Post/like/reply/retweet. Social media surface[^18] |

**NanoPilot Coverage: 7/13 (54%)**

**Gap Analysis — Messaging:**
- **Signal** — highest novelty for privacy-focused users
- **iMessage** — Apple ecosystem integration (pairs well with macOS status bar skill)
- **Matrix** — federated/self-hosted, appeals to same audience as NanoPilot
- **WebChat** — zero-setup demo/onboarding surface

---

### Category B: CLI & Terminal (Developer-First)

| Modality | NanoPilot | OpenClaw | Competitors | Notes |
|----------|-----------|----------|-------------|-------|
| **Standalone CLI (claw)** | ✅ | ✅ | Claude Code, Codex CLI, Aider, Gemini CLI | NanoPilot's claw is a Python script that spawns containers directly[^19] |
| **Interactive REPL** | ❌ | ❌ | Claude Code, Aider, OpenCode | Multi-turn conversational session in terminal. Aider has voice support[^20] |
| **TUI (Terminal UI)** | ❌ | ❌ | OpenCode (Bubble Tea) | Rich terminal interface with panels, file trees, clickable elements[^21] |
| **Pipe/stdin mode** | ✅ | ✅ | Claude Code (`-p`), Codex CLI | claw supports `--pipe` for stdin. Key for scripting[^22] |
| **Git worktree integration** | ❌ | ❌ | Claude Code | Auto-setup worktrees per agent session for parallel branch work[^23] |

**NanoPilot Coverage: 2/5 (40%)**

**Gap Analysis — CLI:**
- **Interactive REPL** — claw is currently fire-and-forget (single prompt → response). A persistent REPL session with multi-turn conversation, history, and tab completion would be a major upgrade
- **TUI** — a Bubble Tea or blessed-style terminal UI with panels for output, session list, and input
- **Git worktree** — each claw session could auto-create a worktree for isolated coding

---

### Category C: IDE & Editor Integration (Development-Specific)

| Modality | NanoPilot | OpenClaw | Competitors | Notes |
|----------|-----------|----------|-------------|-------|
| **Emacs** | ✅ skill | ❌ | thox.el, Claude Code | NanoPilot uses HTTP bridge, org-mode integration[^24] |
| **VS Code Extension** | ❌ | ✅ (plugin) | Copilot, Cline, Windsurf, Cursor | Largest IDE market share. Chat panel + inline agent[^25] |
| **Neovim Plugin** | ❌ | ❌ | CodeCompanion.nvim, agentic.nvim, Copilot.lua | Modal editing integration. Terminal-first devs[^26] |
| **JetBrains Plugin** | ❌ | ❌ | JetBrains AI, Thox, Cline | IntelliJ/PyCharm/WebStorm. ACP protocol[^27] |
| **Vim Plugin** | ❌ | ❌ | Various | Smaller but dedicated audience |
| **Xcode Extension** | ❌ | ❌ | CopilotForXcode | Apple development ecosystem |
| **Jupyter/Notebook** | ❌ | ❌ | Various plugins | Data science/ML workflow. Cell-level agent interaction[^28] |

**NanoPilot Coverage: 1/7 (14%)**

**Gap Analysis — IDE:**
This is NanoPilot's **biggest gap** and highest-priority area for development-specific modalities:
- **VS Code Extension** — would reach the largest developer audience. Could use MCP or HTTP bridge (similar to Emacs approach)
- **Neovim Plugin** — natural fit for NanoPilot's terminal-centric philosophy
- **JetBrains Plugin** — enterprise developer reach

---

### Category D: Automation & CI/CD Triggers (Development-Specific)

| Modality | NanoPilot | OpenClaw | Competitors | Notes |
|----------|-----------|----------|-------------|-------|
| **Git commit hooks** | ❌ | ❌ | Custom scripts | Pre-commit agent review, post-commit actions[^29] |
| **GitHub Actions / CI agent** | ❌ | ❌ | Copilot CLI in Actions | Agent as CI step: PR review, security scan, test gen[^30] |
| **PR review bot** | ❌ | ❌ | Qodo, CodeRabbit | Auto-review PRs on open/update[^31] |
| **File watcher trigger** | ❌ | ❌ | Claude Code (watch mode) | Agent reacts to file changes (save-triggered)[^32] |
| **Cron/scheduled tasks** | ✅ | ✅ | Custom | NanoPilot has task-scheduler.ts for scheduled agent runs[^33] |
| **Webhook endpoint (inbound)** | ❌ | ✅ | Many | HTTP endpoint to trigger agent from any system[^34] |
| **IPC filesystem** | ✅ | ❌ | Unique | NanoPilot's unique IPC: JSON files in watched directories[^35] |

**NanoPilot Coverage: 2/7 (29%)**

**Gap Analysis — Automation:**
- **Webhook/API endpoint** — a lightweight HTTP server that accepts POST requests to trigger agent runs. This is the universal glue for integrating with any external system
- **Git hooks** — pre-commit security review, post-commit changelog generation
- **GitHub Actions integration** — run NanoPilot agent as a CI step
- **File watcher** — react to file saves with agent suggestions

---

### Category E: OS-Level & Ambient Surfaces (Novel)

| Modality | NanoPilot | OpenClaw | Competitors | Notes |
|----------|-----------|----------|-------------|-------|
| **macOS Menu Bar** | ✅ skill | ✅ | BoltAI, Elephas | Status indicator with start/stop/restart[^36] |
| **Raycast Extension** | ❌ | ❌ | Raycast AI native | Launcher-based agent. Natural language commands from anywhere[^37] |
| **macOS Spotlight** | ❌ | ❌ | Apple Intelligence | App Intents-based. Agent actions discoverable via system search[^38] |
| **Apple Shortcuts** | ❌ | ❌ | BuildShip, n8n templates | Cross-device automation. Siri voice trigger → agent[^39] |
| **iOS Widget** | ❌ | ✅ | Various | Glanceable agent status/quick actions on home screen[^40] |
| **System Tray (Linux/Win)** | ❌ | ✅ | Various | Cross-platform persistent indicator[^41] |
| **Notification Center** | ❌ | ✅ | Various | Push agent responses as OS notifications |

**NanoPilot Coverage: 1/7 (14%)**

**Gap Analysis — Ambient:**
- **Raycast Extension** — extremely high novelty for macOS power users. ⌘+Space → type agent prompt → get response. Zero context switch
- **Apple Shortcuts** — "Hey Siri, ask NanoPilot to deploy staging" from any Apple device
- **System notifications** — push agent responses as native OS notifications

---

### Category F: Voice & Multimodal (Novel)

| Modality | NanoPilot | OpenClaw | Competitors | Notes |
|----------|-----------|----------|-------------|-------|
| **Voice transcription (WhatsApp)** | ✅ skill | ✅ | — | Whisper-based. Voice notes → text[^42] |
| **Voice input (standalone)** | ❌ | ✅ | Aider, Siri | Microphone → agent prompt. No chat app needed[^43] |
| **Image vision** | ✅ skill | ✅ | GPT-4V, Claude | Process images as multimodal content[^44] |
| **PDF reading** | ✅ skill | ✅ | Various | pdftotext extraction[^45] |
| **Screen capture/vision** | ❌ | ❌ | Claude Computer Use | Agent sees your screen, acts on it |
| **Text-to-speech response** | ❌ | ✅ | ElevenLabs, OpenAI TTS | Agent responds with audio |
| **Video/screen recording** | ❌ | ❌ | Emerging | Agent processes video content |

**NanoPilot Coverage: 3/7 (43%)**

---

### Category G: Wearable & Automotive (Frontier/Novel)

| Modality | NanoPilot | OpenClaw | Anyone | Notes |
|----------|-----------|----------|--------|-------|
| **Apple Watch** | ❌ | ❌ | Siri | Complication + voice query. Context-sensitive glanceable info[^46] |
| **CarPlay** | ❌ | ❌ | ChatGPT | Voice-only for safety. Third-party AI assistants now supported[^47] |
| **AR/Smart Glasses** | ❌ | ❌ | Meta AI | Voice-centric with visual overlay. Frontier modality |
| **IoT/Home Assistant** | ❌ | ✅ | OpenClaw skills | Smart home control via agent |

**NanoPilot Coverage: 0/4 (0%)**

These are frontier modalities. CarPlay and Apple Watch are the most plausible near-term additions given NanoPilot's Apple ecosystem affinity (macOS menu bar, Apple Container support).

---

### Category H: Protocol & Integration Layer (Developer Infrastructure)

| Modality | NanoPilot | OpenClaw | Standard | Notes |
|----------|-----------|----------|----------|-------|
| **MCP Server** | ❌ | ✅ | MCP (Model Context Protocol) | Expose NanoPilot as an MCP tool server. Any MCP client can invoke it[^48] |
| **MCP Client** | Partial (Ollama) | ✅ | MCP | NanoPilot can call MCP servers (Ollama skill). Not a general MCP client[^49] |
| **REST API** | ❌ | ✅ | HTTP/REST | Expose agent as API for custom frontends and integrations[^50] |
| **gRPC** | ❌ | ❌ | gRPC | High-performance agent invocation |
| **Unix socket** | ❌ | ❌ | Unix IPC | Local high-perf agent communication |
| **ACP (Agent Client Protocol)** | ❌ | ❌ | Cline ACP | Standardized agent-editor bridge[^51] |

**NanoPilot Coverage: 0.5/6 (~8%)**

**Gap Analysis — Protocol:**
- **REST API / Webhook server** — single most impactful integration addition. Makes NanoPilot composable with everything
- **MCP Server mode** — expose NanoPilot capabilities to Claude Code, Cursor, VS Code, etc.
- **ACP support** — emerging standard for editor ↔ agent communication

---

## 2. Prioritized Recommendations

### Tier 1: High Impact, High Novelty (Build These)

| # | Modality | Category | Rationale |
|---|----------|----------|-----------|
| 1 | **HTTP API / Webhook endpoint** | Protocol | Universal glue. Enables all other integrations. Accept POST → run agent → return response. Trivially enables Raycast, Shortcuts, CI/CD, custom UIs |
| 2 | **Interactive REPL mode for claw** | CLI | Transform claw from single-shot to persistent multi-turn session. Session history, tab completion, `/slash` commands. Direct competitor to Claude Code's interactive mode |
| 3 | **VS Code Extension** | IDE | Largest developer audience. Use HTTP bridge (skill #1) as backend. Chat panel + inline code actions |
| 4 | **Neovim Plugin** | IDE | Natural fit for terminal-first NanoPilot users. Lua plugin calling HTTP API |
| 5 | **Git hook integration** | Automation | Pre-commit: security/style review. Post-push: auto-changelog. Shell scripts that call claw |

### Tier 2: Medium Impact, Good Novelty (Differentiation)

| # | Modality | Category | Rationale |
|---|----------|----------|-----------|
| 6 | **Raycast Extension** | Ambient | ⌘+Space → agent prompt. Zero context switch. Extremely novel for macOS users |
| 7 | **Apple Shortcuts action** | Ambient | "Hey Siri, ask NanoPilot..." from any Apple device. Cross-device voice trigger |
| 8 | **MCP Server mode** | Protocol | Expose NanoPilot as tool to Claude Code, Cursor, etc. Makes NanoPilot composable in the AI tool ecosystem |
| 9 | **GitHub Actions integration** | Automation | Agent-powered PR review, test generation, security scanning as CI step |
| 10 | **Signal channel** | Messaging | E2E encrypted. Privacy-conscious users. Differentiates from OpenClaw's broader-but-shallower approach |

### Tier 3: Niche but Novel (Exploratory)

| # | Modality | Category | Rationale |
|---|----------|----------|-----------|
| 11 | **File watcher / save trigger** | Automation | Agent reacts to file saves. Auto-test, auto-lint, auto-document |
| 12 | **TUI (Terminal UI)** | CLI | Rich Bubble Tea interface. Session management, output panels |
| 13 | **Matrix channel** | Messaging | Federated, self-hosted, widget support. Appeals to privacy/sovereignty crowd |
| 14 | **WebChat** | Messaging | Browser-based. Zero-install demo surface |
| 15 | **CarPlay voice agent** | Frontier | Voice-only. Hands-free coding queries while commuting |
| 16 | **Apple Watch complication** | Frontier | Glanceable agent status. Quick voice query |

---

## 3. Development-Specific Modality Deep Dive

The user specifically asked about modalities "specific for development." Here's the focused analysis:

### 3a. The Developer Interaction Loop

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   THINK      │────▶│   CODE       │────▶│   VERIFY     │
│ (plan, ask)  │     │ (write, edit)│     │ (test, lint) │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
  ┌─────────┐         ┌─────────┐         ┌─────────┐
  │ Chat    │         │ IDE     │         │ CI/CD   │
  │ CLI     │         │ Editor  │         │ Git     │
  │ REPL    │         │ REPL    │         │ Hooks   │
  └─────────┘         └─────────┘         └─────────┘
```

NanoPilot currently serves the **THINK** phase well (chat channels, claw CLI) but is **weak in CODE and VERIFY** phases. The biggest development-specific wins are:

### 3b. IDE Integration (CODE Phase)

**Why it matters:** Developers spend 60-80% of their time in an editor. If NanoPilot isn't there, it's not part of the core loop.

**Implementation approach for NanoPilot:**
1. Add an HTTP API skill (lightweight Express/Fastify server in the main process)
2. VS Code extension calls this API for: prompt submission, session management, code insertion
3. Neovim plugin uses the same API via Lua HTTP client
4. Emacs skill already demonstrates this pattern (HTTP bridge)[^24]

### 3c. Git Integration (VERIFY Phase)

**Why it matters:** Every meaningful code change touches git. Agent review at commit/push time catches issues before they reach CI.

**Implementation approach for NanoPilot:**
```bash
# .git/hooks/pre-commit
#!/bin/bash
DIFF=$(git diff --cached)
RESULT=$(echo "$DIFF" | claw --pipe "Review this diff for bugs, security issues, and style problems. Reply PASS or FAIL with reasons.")
if echo "$RESULT" | grep -q "FAIL"; then
    echo "$RESULT"
    exit 1
fi
```

### 3d. CI/CD Integration (VERIFY Phase)

**Why it matters:** Agent-powered PR review, test generation, and security scanning as automated CI steps.

**Implementation approach for NanoPilot:**
```yaml
# .github/workflows/nanopilot-review.yml
on: pull_request
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Agent PR Review
        run: |
          DIFF=$(git diff origin/main...HEAD)
          echo "$DIFF" | claw --pipe --timeout 120 \
            "Review this PR for correctness, security, and test coverage."
```

### 3e. REPL Mode (THINK + CODE Phase)

**Why it matters:** Single-shot `claw` is limited. A persistent REPL enables multi-turn development conversations: "Create a function" → "Add error handling" → "Write tests" → "Commit it".

**What competitors offer:**
- Claude Code: Full interactive REPL with `/commands`, tool permissions, session resume
- Aider: Chat-based with auto-commit, voice input, repo-wide context
- OpenCode: Bubble Tea TUI with panels, file tree, session management

### 3f. File Watcher (CODE Phase)

**Why it matters:** Agent reacts to file saves — auto-running tests, suggesting fixes, updating docs.

**Implementation approach:** A simple `chokidar`/`fswatch` wrapper that invokes claw on changed files:
```bash
fswatch -0 src/ | while read -d '' file; do
    claw --pipe "I just edited $file. Run relevant tests and tell me if anything broke." < "$file"
done
```

---

## 4. Novelty Assessment

### What No One Else Has (True Differentiation Opportunities)

1. **IPC Filesystem Protocol** — NanoPilot's unique approach of agents communicating via JSON files in watched directories[^35] is architecturally novel. No competitor does this. It enables cross-container, cross-process communication without HTTP overhead.

2. **Container-Isolated Agent Sessions** — Each NanoPilot agent runs in its own container with isolated filesystem and memory[^52]. Combined with the Claw CLI, this is a security model that OpenClaw lacks.

3. **Multi-Channel Agent Swarm** — The Telegram Swarm skill gives each sub-agent its own bot identity[^53]. This multi-persona pattern is rare.

4. **Group-Isolated Memory** — Per-group CLAUDE.md files provide isolated persistent memory per conversation context[^54]. Competitors typically have a single global memory.

### What's Novel in the Broader Landscape

| Innovation | Who Has It | Novelty Score | Dev-Specific? |
|-----------|-----------|---------------|---------------|
| Raycast/Spotlight agent | Nobody (for personal AI agents) | ⭐⭐⭐⭐⭐ | Partial |
| Apple Shortcuts → agent | Nobody (for self-hosted agents) | ⭐⭐⭐⭐⭐ | No |
| Git hook agent review | Custom scripts only | ⭐⭐⭐⭐ | Yes |
| CI/CD agent step | Emerging (Copilot in Actions) | ⭐⭐⭐⭐ | Yes |
| MCP server mode (be a tool) | Nobody (for personal agents) | ⭐⭐⭐⭐ | Yes |
| ACP editor protocol | Cline only | ⭐⭐⭐⭐ | Yes |
| File watcher trigger | Claude Code (partial) | ⭐⭐⭐ | Yes |
| Interactive REPL CLI | Claude Code, Aider | ⭐⭐⭐ | Yes |
| CarPlay voice agent | ChatGPT (2026) | ⭐⭐⭐⭐⭐ | No |
| Apple Watch agent | Nobody | ⭐⭐⭐⭐⭐ | No |

---

## 5. Current NanoPilot Modality Map

### What NanoPilot Has Today

```
                    NanoPilot Modality Coverage (April 2026)

MESSAGING          CLI              IDE             AUTOMATION        AMBIENT          VOICE/MULTI
─────────────────  ───────────────  ──────────────  ────────────────  ───────────────  ─────────────
✅ Telegram        ✅ claw CLI      ✅ Emacs        ✅ Cron/schedule  ✅ macOS bar     ✅ Voice→text
✅ WhatsApp        ✅ stdin pipe                     ✅ IPC filesystem                  ✅ Image vision
✅ Slack                                                                               ✅ PDF reading
✅ Discord
✅ Gmail
✅ X (Twitter)

MISSING (HIGH PRIORITY)
─────────────────────────────────────────────────────────────────────────────────
❌ HTTP API        ❌ Interactive    ❌ VS Code       ❌ Webhook        ❌ Raycast      ❌ Standalone
   endpoint           REPL         ❌ Neovim        ❌ Git hooks      ❌ Shortcuts        voice
                                   ❌ JetBrains     ❌ GH Actions     ❌ Spotlight
                                                    ❌ File watcher
```

### Coverage Summary

| Category | Covered | Total | Percentage |
|----------|---------|-------|------------|
| Messaging Channels | 7 | 13 | 54% |
| CLI & Terminal | 2 | 5 | 40% |
| IDE & Editor | 1 | 7 | 14% |
| Automation & CI/CD | 2 | 7 | 29% |
| OS-Level & Ambient | 1 | 7 | 14% |
| Voice & Multimodal | 3 | 7 | 43% |
| Wearable & Automotive | 0 | 4 | 0% |
| Protocol & Integration | 0.5 | 6 | 8% |
| **TOTAL** | **16.5** | **56** | **29%** |

---

## 6. Strategic Recommendation

### The "HTTP API First" Strategy

The single highest-leverage addition is an **HTTP API/webhook endpoint** because it unlocks nearly every other modality:

```
                    ┌─────────────────┐
                    │  NanoPilot HTTP  │
                    │   API Endpoint   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
   │ VS Code │         │ Raycast │         │  Apple  │
   │Extension│         │Extension│         │Shortcuts│
   └─────────┘         └─────────┘         └─────────┘
        │                    │                    │
   ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
   │ Neovim  │         │ Git     │         │ GitHub  │
   │ Plugin  │         │ Hooks   │         │ Actions │
   └─────────┘         └─────────┘         └─────────┘
        │                    │                    │
   ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
   │ JetBra  │         │  File   │         │ Webhook │
   │  ins    │         │ Watcher │         │ Inbound │
   └─────────┘         └─────────┘         └─────────┘
```

Once the HTTP API exists, every other modality becomes a thin client.

### Build Order

1. **HTTP API endpoint** (enables everything)
2. **Interactive REPL for claw** (biggest CLI improvement)
3. **Git hook scripts** (leverage existing claw + pipe)
4. **VS Code extension** (largest developer audience)
5. **Neovim plugin** (natural NanoPilot audience)
6. **Raycast extension** (macOS novelty)
7. **Apple Shortcuts** (cross-device novelty)
8. **MCP server mode** (AI ecosystem composability)

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|------------|-------|
| NanoPilot current modality inventory | **High** | Direct source code analysis[^1] |
| OpenClaw feature set and channel list | **High** | Official docs and multiple sources[^2][^11][^12] |
| Competitor CLI tool capabilities | **High** | Well-documented open-source tools[^4][^20][^21] |
| IDE integration landscape | **High** | Verified across multiple sources[^25][^26][^27] |
| Novel ambient modalities (Raycast, Shortcuts) | **Medium-High** | Based on platform capabilities, not yet implemented by personal AI agents |
| Frontier modalities (CarPlay, Watch, AR) | **Medium** | Early-stage or announced, not widely deployed for personal AI agents |
| Strategic recommendations | **Medium-High** | Based on architectural analysis of NanoPilot + industry patterns |

---

## Footnotes

[^1]: NanoPilot source code analysis — `.claude/skills/`, `src/channels/`, `src/types.ts`, `src/container-runner.ts`
[^2]: [OpenClaw Official Docs](https://docs.openclaw.ai/)
[^3]: [NanoClaw vs OpenClaw comparison](https://www.eigent.ai/blog/nanoclaw-vs-openclaw), [GitHub: qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw)
[^4]: [OSS CLI AI Coding Agents Comparison](https://gist.github.com/intellectronica/e7a6920664a6d5b3608d7032f248bfdc)
[^5]: [Raycast AI Extensions](https://www.macstories.net/reviews/hands-on-with-raycasts-new-ai-extensions/), [Apple App Intents](https://developer.apple.com/documentation/appintents/)
[^6]: NanoPilot skill: `.claude/skills/add-whatsapp/SKILL.md`
[^7]: NanoPilot: `src/channels/telegram.ts` (Grammy-based, JID format `tg:{chatId}`)
[^8]: NanoPilot skill: `.claude/skills/add-slack/SKILL.md`
[^9]: NanoPilot skill: `.claude/skills/add-discord/SKILL.md`
[^10]: NanoPilot skill: `.claude/skills/add-gmail/SKILL.md`
[^11]: [OpenClaw Channels: Signal](https://docs.openclaw.ai/channels), [OpenClaw Channel Integrations](https://openclaw-ai.com/en/channels)
[^12]: [OpenClaw iMessage via BlueBubbles](https://openclawskills.dev/channels/)
[^13]: [OpenClaw Matrix Channel](https://docs.openclaw.ai/channels)
[^14]: [OpenClaw IRC Channel](https://openclaw-ai.com/en/channels)
[^15]: [OpenClaw Teams Integration](https://docs.openclaw.ai/channels)
[^16]: [OpenClaw WebChat](https://openclaw-ai.com/en/channels)
[^17]: [OpenClaw Extension Ecosystem](https://help.apiyi.com/en/openclaw-extensions-ecosystem-guide-en.html)
[^18]: NanoPilot skill: `.claude/skills/x-integration/SKILL.md`
[^19]: NanoPilot Claw: `.claude/skills/claw/scripts/claw` (Python 3, 371 lines)
[^20]: [Aider — Chat-based AI coding](https://rumjahn.com/openai-codex-vs-aider-vs-claude-code-which-terminal-ai-coding-editor-is-best-in-2025/)
[^21]: [OpenCode TUI](https://gist.github.com/intellectronica/e7a6920664a6d5b3608d7032f248bfdc)
[^22]: NanoPilot Claw: `.claude/skills/claw/SKILL.md` lines 66-101 (pipe mode documentation)
[^23]: [Claude Code git worktree support](https://code.claude.com/docs/en/changelog)
[^24]: NanoPilot skill: `.claude/skills/add-emacs/SKILL.md`
[^25]: [JetBrains AI Assistant for VS Code](https://www.jetbrains.com/aia-vscode/), [Claude Code IDE Integrations](https://hypereal.tech/en/a/claude-code-ide-integrations)
[^26]: [Best AI Coding Agents for Neovim](https://zencoder.ai/blog/ai-coding-agent-for-neovim), [CodeCompanion.nvim](https://github.com/olimorris/codecompanion.nvim)
[^27]: [ACP Editor Integrations — Cline](https://docs.cline.bot/cline-cli/acp-editor-integrations)
[^28]: [Jupyter + AI agent integration](https://awesome.ecosyste.ms/lists/tribixbite%2Fawesome?language=Jupyter+Notebook)
[^29]: [AI Agents in CI/CD with Git Hooks](https://dev.to/vevarunsharma/injecting-ai-agents-into-cicd-using-github-copilot-cli-in-github-actions-for-smart-failures-58m8)
[^30]: [Automating tasks with Copilot CLI and GitHub Actions](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/automate-with-actions)
[^31]: [GitHub Agentic Workflows](https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/)
[^32]: [Claude Code file watcher / FSEvents improvements](https://code.claude.com/docs/en/changelog)
[^33]: NanoPilot: `src/task-scheduler.ts`
[^34]: [OpenClaw Webhook/API support](https://openclaw-ai.com/en/features)
[^35]: NanoPilot: `src/ipc.ts` (IPC filesystem watcher, JSON files in watched directories)
[^36]: NanoPilot skill: `.claude/skills/add-macos-statusbar/SKILL.md`
[^37]: [Raycast AI Extensions](https://www.macstories.net/reviews/hands-on-with-raycasts-new-ai-extensions/), [Raycast AI Workspace Guide](https://innora.ai/blog/raycast-ai-intelligent-workspace)
[^38]: [Apple App Intents](https://developer.apple.com/documentation/appintents/)
[^39]: [Apple Shortcuts AI Agent](https://n8n.io/workflows/2436-siri-ai-agent-apple-shortcuts-powered-voice-template/), [BuildShip Shortcuts](https://buildship.com/blog/ai-assistant-on-apple-shortcuts)
[^40]: [OpenClaw mobile clients](https://openclaw.ai/)
[^41]: [macOS AI Clients Compared](https://blog.apps.deals/2025-04-28-macos-ai-clients-comparison)
[^42]: NanoPilot skill: `.claude/skills/add-voice-transcription/SKILL.md`
[^43]: [Aider voice input support](https://rumjahn.com/openai-codex-vs-aider-vs-claude-code-which-terminal-ai-coding-editor-is-best-in-2025/)
[^44]: NanoPilot skill: `.claude/skills/add-image-vision/SKILL.md`
[^45]: NanoPilot skill: `.claude/skills/add-pdf-reader/SKILL.md`
[^46]: [Apple Watch AI Complications](https://blog.carplayhacks.com/ios-26-apple-carplay/)
[^47]: [CarPlay AI Assistants 2026](https://applemagazine.com/carplay-ai-2026/), [ChatGPT on CarPlay](https://www.macrumors.com/2026/03/31/openai-chatgpt-carplay/)
[^48]: [MCP Complete Guide](https://calmops.com/ai/model-context-protocol-mcp-complete-guide/), [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started)
[^49]: NanoPilot skill: `.claude/skills/add-ollama-tool/SKILL.md`
[^50]: [OpenClaw REST API](https://openclaw-ai.com/en/features)
[^51]: [Cline ACP — Agent Client Protocol](https://docs.cline.bot/cline-cli/acp-editor-integrations)
[^52]: NanoPilot: `src/container-runner.ts` (container isolation with volume mounts, token via stdin)
[^53]: NanoPilot skill: `.claude/skills/add-telegram-swarm/SKILL.md`
[^54]: NanoPilot: `groups/{name}/CLAUDE.md` (per-group isolated persistent memory)

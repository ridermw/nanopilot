# Changelog

## 2.0.0

Initial release of NanoPilot — a personal AI assistant powered by the GitHub Copilot SDK.

### Highlights

- **GitHub Copilot SDK integration** — Uses the official `@github/copilot-sdk` for agent interactions
- **Simple authentication** — One GitHub token (`COPILOT_GITHUB_TOKEN`) via `gh auth login`
- **Secure token handling** — Tokens passed via stdin to containers, never stored in environment variables
- **Log redaction** — GitHub token patterns (`gho_*`, `ghu_*`, `ghp_*`, `github_pat_*`) automatically redacted from all output
- **Session resilience** — Stale session detection with timeout-based retry and automatic session recreation
- **Conversation archiving** — Full conversation transcripts archived before context compaction
- **Multi-channel support** — WhatsApp, Telegram, Slack, Discord, Gmail (via skills)
- **Container isolation** — Each group runs in its own Linux container with isolated filesystem
- **282 tests passing** — Comprehensive test suite covering host and agent-runner

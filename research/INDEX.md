# NanoPilot Research Index

> Master index of the NanoPilot research portfolio. Catalogs all existing research,
> identifies cross-cutting themes, surfaces gaps, and proposes new research topics.
>
> Last updated: 2026-04-05

---

## Table of Contents

1. [Existing Research Catalog](#existing-research-catalog)
2. [Cross-Cutting Themes](#cross-cutting-themes)
3. [Convergence Analysis](#convergence-analysis)
4. [New Research Topics](#new-research-topics)
5. [GitHub Landscape Discoveries](#github-landscape-discoveries)
6. [Master Prioritization](#master-prioritization)
7. [Reading Order](#reading-order)

---

## Existing Research Catalog

### Foundation Layer

| # | Document | Lines | Summary | Key Takeaway for NanoPilot |
|---|----------|-------|---------|---------------------------|
| 1 | `interaction-modalities.md` | 497 | 56 modalities across 8 categories (CLI, messaging, IDE, web, voice, wearables, ambient, API) | NanoPilot already covers messaging and CLI; HTTP API and IDE integration are the biggest gaps |
| 2 | `agent-native-ux-patterns.md` | 195 | Approval gates, trust calibration, anti-spam, progressive autonomy | NanoPilot's group-based trust model is solid; needs graduated autonomy levels per group |
| 3 | `agent-tool-use-mcp.md` | 196 | MCP specification, 16K+ servers, registries, tool composition patterns | NanoPilot already uses MCP; opportunity to become a registry consumer and skill publisher |

### Agent Architecture

| # | Document | Lines | Summary | Key Takeaway for NanoPilot |
|---|----------|-------|---------|---------------------------|
| 4 | `agent-memory-architectures.md` | 458 | MemGPT, LangGraph, CrewAI, Zep, Mem0 — tiered memory, RAG, knowledge graphs | NanoPilot uses flat CLAUDE.md files; structured memory with retrieval is the #1 architectural upgrade |
| 5 | `multi-agent-orchestration.md` | 205 | 8 orchestration patterns (supervisor, chain, map-reduce, debate, swarm) | NanoPilot's group isolation maps to "workspace" pattern; Telegram swarm shows multi-agent is viable |
| 6 | `anthropic-adversarial-multiagent.md` | 233 | Multi-agent safety, long-running task patterns, adversarial resilience | Monitor-pattern and constitutional checks apply directly to auto-research and autopilot features |

### Autonomy and Self-Improvement

| # | Document | Lines | Summary | Key Takeaway for NanoPilot |
|---|----------|-------|---------|---------------------------|
| 7 | `self-improving-agent-loops.md` | 265 | Constitutional AI, DSPy, Voyager, autoresearch — self-improvement without fine-tuning | Autoresearch pattern is directly implementable; Voyager's skill library concept maps to NanoPilot skills |
| 8 | `agent-autonomy-landscape.md` | 368 | L1-L5 autonomy framework, harness architectures, enterprise adoption, startup survey | NanoPilot is at L2-L3; roadmap to L4 via scheduled tasks + IPC + writable mounts |
| 9 | `nanopilot-full-autopilot.md` | 605 | Full self-ownership research — issue triage, PR management, self-testing, research automation | Only 3 changes needed for self-ownership; all 8 operations pass constitution's 7 tests |

### Implementation and Planning

| # | Document | Lines | Summary | Key Takeaway for NanoPilot |
|---|----------|-------|---------|---------------------------|
| 10 | `auto-research-audit.md` | 519 | Karpathy autoresearch + 2 community forks — metric mode, task mode, parallel discovery | Community adaptations (gyoz-ai, brycealindberg) provide concrete patterns for NanoPilot skill |
| 11 | `auto-research-plan.md` | 215 | v1 implementation plan — critique-validated, 9 todos, writable mount solution | Ready for implementation; container mount fix and state ownership split are key innovations |
| 12 | `autonomous-coding-agents.md` | 180 | Devin, SWE-Agent, OpenHands, Aider, Claude Code — capabilities and limitations | NanoPilot differentiates via persistent identity, multi-channel, and chat-based steering |

### Safety and Evaluation

| # | Document | Lines | Summary | Key Takeaway for NanoPilot |
|---|----------|-------|---------|---------------------------|
| 13 | `agent-safety-sandboxing.md` | 193 | E2B, Modal, prompt injection, HITL patterns, sandbox architectures | NanoPilot's Docker isolation is strong; needs prompt injection defense and structured HITL gates |
| 14 | `agent-evaluation-benchmarks.md` | 207 | SWE-bench, GAIA, AgentBench, WebArena — how to measure agent quality | No existing NanoPilot testing strategy; needs internal benchmark suite |

### External Ecosystem

| # | Document | Lines | Summary | Key Takeaway for NanoPilot |
|---|----------|-------|---------|---------------------------|
| 15 | `gstack-deep-dive.md` | 635 | 31 gstack skills audited, 4-phase extraction roadmap, growth analysis | Phase 1 extractables: browse, design-review, benchmark, canary; already partially integrated |

**Total: 15 documents, ~4,971 lines**

---

## Cross-Cutting Themes

Six themes recur across 3+ documents, suggesting they are foundational rather than niche:

### Theme 1: Structured Memory is the Bottleneck
- **Appears in:** memory-architectures, self-improving-loops, autonomy-landscape, full-autopilot, agent-native-ux
- **Insight:** Every advanced capability (autonomy, self-improvement, cross-session learning) depends
  on memory that is more structured than flat CLAUDE.md files. Tiered memory (working/episodic/semantic)
  with retrieval is the single highest-leverage architectural change.

### Theme 2: HTTP API Unlocks New Modalities
- **Appears in:** interaction-modalities, full-autopilot, gstack-deep-dive, agent-tool-use-mcp
- **Insight:** A lightweight HTTP endpoint would enable IDE plugins, webhooks (GitHub/CI), Shortcuts,
  cron triggers, and MCP server mode — unlocking 15+ new interaction modalities with one change.

### Theme 3: Planning-Review Pipeline is Table Stakes
- **Appears in:** gstack-deep-dive, autonomous-coding-agents, self-improving-loops, auto-research-plan
- **Insight:** Gstack's CEO/design/eng review cascade, Devin's plan-execute-verify loop, and
  autoresearch's hill-climbing all converge on: agents need structured plan-execute-review cycles.

### Theme 4: Container Isolation is a Competitive Advantage
- **Appears in:** safety-sandboxing, full-autopilot, auto-research-plan, autonomous-coding-agents
- **Insight:** NanoPilot's Docker containers + read-only mounts + IPC protocol already exceed the
  isolation of most competitors. This is a differentiator to emphasize, not a limitation.

### Theme 5: Constitutional Governance Enables Trust
- **Appears in:** full-autopilot, self-improving-loops, anthropic-adversarial-multiagent, safety-sandboxing
- **Insight:** NanoPilot's CONSTITUTION.md with 7 decision tests is uncommon in the ecosystem.
  It provides a formal framework for safely expanding autonomy — use it as the gate for every new capability.

### Theme 6: Multi-Channel is Unique in the Ecosystem
- **Appears in:** interaction-modalities, agent-native-ux, agent-autonomy-landscape
- **Insight:** No other personal AI assistant operates across WhatsApp, Telegram, Slack, Discord,
  and CLI simultaneously. This is NanoPilot's strongest differentiator vs. Claude Code, Devin, etc.

---

## Convergence Analysis

When multiple independent documents recommend the same thing, confidence is high:

| Recommendation | Documents Recommending | Confidence |
|---------------|----------------------|------------|
| Structured memory upgrade | 5 of 15 | Very High |
| HTTP API endpoint | 4 of 15 | High |
| Planning-review pipeline | 4 of 15 | High |
| Prompt injection defense | 3 of 15 | Moderate-High |
| Testing/benchmark suite | 3 of 15 | Moderate-High |
| Token budget management | 3 of 15 | Moderate-High |

---

## New Research Topics

The following 10 topics represent gaps **not covered** in any existing document. Each includes
why it matters for NanoPilot, what to investigate, and key projects/references discovered
during GitHub and web research.

### Gap 1: Context Engineering as a Discipline

**Why it matters:** NanoPilot's container isolation means every agent invocation gets a fresh
context window. How that context is assembled — what goes in, what's excluded, how history
is compressed — directly determines agent quality. This is now recognized as a distinct
engineering discipline separate from prompt engineering.

**What to investigate:**
- Anthropic's "Effective Context Engineering for AI Agents" framework
- Stanford/SambaNova's Agentic Context Engineering (ACE) — agents that curate their own playbooks
- Google ADK's context compilation pipeline (processors, filters, just-in-time retrieval)
- Structured handoff artifacts — JSON schemas for passing state between agents/sessions
- Context rot detection and mitigation (NanoPilot's /compact skill is a start)
- Cache-stable request design for KV cache efficiency

**Key references:**
- Anthropic engineering blog on context engineering
- Google ADK architecture for production agents
- Stanford ACE framework for self-curating agents
- NanoPilot's existing: CLAUDE.md per group, session files, IPC messages

**NanoPilot opportunity:** Design a context compilation layer that assembles optimal context
from group memory, recent messages, tool results, and scratchpad — per invocation. This is
the missing piece between flat CLAUDE.md and true structured memory.

---

### Gap 2: Agent Observability and Tracing

**Why it matters:** NanoPilot has no visibility into what happens inside containers beyond
stdout logs. As autonomy increases (auto-research, autopilot), operators need structured
traces of every LLM call, tool invocation, decision point, and outcome.

**What to investigate:**
- OpenTelemetry as the standard for agent tracing (vendor-neutral, self-hostable)
- Langfuse (17K+ stars) — OSS, MIT-licensed, deep step-level trace visualization
- RagaAI Catalyst (16K stars) — agent-specific observability with execution graphs
- OpenLIT (2.3K stars) — OpenTelemetry-native LLM observability
- Braintrust — CI/CD eval-controlled deployments
- Cost-per-invocation tracking and token usage dashboards

**Key projects discovered:**
- langfuse/langfuse — Leading OSS LLM observability
- raga-ai-hub/RagaAI-Catalyst — Agent tracing with timeline and execution graphs
- openlit/openlit — OpenTelemetry-native, integrates with 50+ providers

**NanoPilot opportunity:** Emit OpenTelemetry traces from container-runner.ts and agent-runner.
Self-host Langfuse or OpenLIT for a local dashboard. Critical for debugging auto-research
iterations and understanding why agents make specific decisions.

---

### Gap 3: Voice and Realtime Multimodal Agents

**Why it matters:** NanoPilot already supports voice note transcription (Whisper), but the
ecosystem is moving toward realtime bidirectional voice — agents that listen and speak
simultaneously with sub-second latency. This is the next frontier after text messaging.

**What to investigate:**
- LiveKit Agents (10K+ stars) — WebRTC-based voice AI framework, used by OpenAI ChatGPT
- TEN Framework (10K+ stars) — graph-based multimodal agent architecture, backed by Agora
- Pipecat — Dailyco's voice agent framework
- Voice Activity Detection (VAD) and semantic turn-taking
- STT to LLM to TTS pipeline optimization for latency
- Telephony integration (SIP/PSTN) for phone-based agents

**NanoPilot opportunity:** A voice channel skill that joins a LiveKit room or answers
phone calls. Users could talk to NanoPilot hands-free while driving, cooking, etc.
Combines with WhatsApp voice notes for a complete voice experience.

---

### Gap 4: Computer Use and GUI Agents

**Why it matters:** NanoPilot agents currently operate through CLI commands and file operations
inside containers. Computer-use agents can interact with GUIs — clicking buttons, filling forms,
navigating websites — dramatically expanding what agents can automate.

**What to investigate:**
- Anthropic's Computer Use tool (native to Claude)
- Browser-Use (OSS, 89% WebVoyager accuracy, multi-LLM support)
- Agent-E, Skyvern 2.0 — async cloud browser agents
- Open-AutoGLM (25K stars) — phone/mobile GUI automation
- awesome-computer-use — curated collection of all computer-use projects
- NanoPilot's existing gstack/browse skill as a foundation

**NanoPilot opportunity:** The gstack browse skill already provides headless browser automation.
Extending this with computer-use capabilities (screenshot to action loops) would enable
NanoPilot to automate web-based workflows beyond what CLI tools can reach.

---

### Gap 5: TypeScript Agent Framework Landscape

**Why it matters:** NanoPilot is built in TypeScript, but the existing research focuses almost
exclusively on Python frameworks (LangChain, CrewAI, AutoGen). Understanding TypeScript-native
frameworks reveals patterns, libraries, and architectural decisions directly applicable to
NanoPilot's codebase.

**What to investigate:**
- Mastra (23K stars, YC W25, ex-Gatsby team) — agents, workflows, tools, RAG, evals, all in TS
- ElizaOS (18K stars) — multi-agent, persistent character memory, Discord/Telegram native
- Vercel AI SDK — unified model routing across 40+ providers
- Inngest — durable execution for agent workflows in TypeScript
- Effect-TS — typed error handling and concurrency for agent orchestration
- How these frameworks handle the problems NanoPilot solves differently

**Key comparison:**
- **Mastra** — closest architectural analog to NanoPilot (TS, agents, tools, workflows)
  but cloud-first vs NanoPilot's local-first. Mastra's eval framework is worth studying.
- **ElizaOS** — similar multi-channel approach but Web3-focused. Their character/personality
  system and persistent memory are more sophisticated than NanoPilot's current CLAUDE.md.

**NanoPilot opportunity:** Cherry-pick patterns from Mastra (workflow DAGs, eval framework,
OpenTelemetry tracing) and ElizaOS (character-driven memory, multi-platform connectors)
without adopting either framework wholesale.

---

### Gap 6: Skill Marketplace and Registry Patterns

**Why it matters:** NanoPilot has a growing skill system (feature skills, utility skills,
operational skills, container skills) but no discovery mechanism. As the ecosystem matures,
skills need to be findable, versionable, and shareable.

**What to investigate:**
- GitHub MCP Registry — official MCP server discovery
- HOL.org — universal AI agent registry with trustless skills
- Kong Konnect MCP Registry — enterprise governance for AI tools
- microsoft/skills — Microsoft's skills and MCP server catalog
- AGENTS.md / SKILL.md as portable skill description formats
- Registry vs marketplace models (self-host vs managed hosting)
- Semantic versioning and dependency resolution for skills

**NanoPilot opportunity:** Publish NanoPilot skills to the GitHub MCP Registry. Create a
skill search command that discovers and installs community skills. The existing
scripts/apply-skill.ts is already close to an install mechanism.

---

### Gap 7: Token Economics and Cost Management

**Why it matters:** NanoPilot currently has zero visibility into token consumption. As usage
scales (auto-research doing 100+ iterations, scheduled tasks running hourly, multiple groups
active), costs can grow unpredictably. Agent workloads consume 3-10x more tokens than simple
chat due to system prompts, tool calls, and multi-turn reasoning.

**What to investigate:**
- Token cost structure: output tokens cost 3-8x more than input
- Model routing/tiering: use cheap models for simple tasks, expensive ones for reasoning
- Prompt/response caching strategies (70%+ cache hit rates reported)
- Budget caps and per-group/per-task spending limits
- Cost allocation by group, skill, and task type
- Redis-based semantic caching for repeated queries
- Self-hosting vs API economics (break-even at ~1M queries/month)

**NanoPilot opportunity:** Add token tracking to container-runner.ts (Copilot SDK likely
exposes usage metadata). Implement per-group budget caps. Add a cost dashboard skill.
Model routing (cheap model for status checks, expensive for complex tasks) could cut
costs 40-60% with no quality loss.

---

### Gap 8: Agent Testing Strategy

**Why it matters:** NanoPilot has 3 failing tests (per TODOS.md) and no systematic testing
strategy for agent behavior. As the project grows with auto-research, autopilot, and more
skills, untested agent behavior becomes a reliability risk.

**What to investigate:**
- Deterministic unit tests for IPC, scheduling, routing (non-LLM code)
- Integration tests for container lifecycle (spawn, communicate, cleanup)
- Agent behavior testing: mock LLM responses, verify tool call sequences
- Evaluation-driven testing (Mastra's eval framework, Braintrust's CI/CD gating)
- Snapshot testing for prompt templates and system instructions
- End-to-end tests: send message, agent responds, verify output
- Regression testing: ensure skill additions don't break existing behavior

**NanoPilot opportunity:** Create a test pyramid: unit tests (fast, no LLM) at the base,
integration tests (container lifecycle) in the middle, and eval-based behavior tests
(with mock or cheap LLM) at the top. The existing vitest setup supports all of these.

---

### Gap 9: Agent Identity and Persistent Persona

**Why it matters:** NanoPilot groups each have a CLAUDE.md that accumulates memories, but
there's no concept of a coherent agent identity that persists across groups, channels, and
sessions. ElizaOS's character system shows this matters for user trust and engagement.

**What to investigate:**
- ElizaOS character files: personality, background, goals, example conversations
- Parlant (18K stars) — conversational control layer for customer-facing agents
  with behavioral guidelines, contextual rules, and dynamic personas
- Agent persona consistency across channels (same agent, different tone per platform)
- Identity continuity across context window resets
- User mental models of AI agent identity (HCI research)
- How persona affects trust calibration and autonomy willingness

**Key project discovered:**
- emcie-co/parlant (18K stars) — "Conversational control layer" that separates agent
  behavior policy from LLM capabilities. Provides guidelines, rules, and contextual
  behavior injection. Directly relevant to NanoPilot's CLAUDE.md per-group approach.

**NanoPilot opportunity:** Create a global agent identity file (beyond per-group CLAUDE.md)
that defines NanoPilot's core personality, values, and behavioral guidelines. Use Parlant's
contextual rules pattern to adapt tone per channel while maintaining identity consistency.

---

### Gap 10: CI/CD Pipeline for Agent Projects

**Why it matters:** The full-autopilot research envisions NanoPilot managing its own repo,
but there's no CI/CD pipeline to validate changes. Without automated testing and deployment,
autonomous changes are risky regardless of constitutional governance.

**What to investigate:**
- GitHub Actions for NanoPilot: lint, build, test on every PR
- Container build validation (ensure agent-runner compiles and starts)
- Skill validation: verify SKILL.md format, check for required fields
- Deployment pipeline: build, test, deploy to launchd/systemd
- Canary deployment: run new version alongside old, compare behavior
- Rollback mechanisms for failed deployments
- How Braintrust's eval-gated deployments could apply to agent updates

**NanoPilot opportunity:** A GitHub Actions workflow that runs npm run build,
vitest, and validates all SKILL.md files on every PR. This is prerequisite for
the full-autopilot vision — the agent can't safely merge its own PRs without CI.

---

## GitHub Landscape Discoveries

Research across GitHub uncovered several significant projects not mentioned in any existing
document. These represent potential collaboration targets, pattern sources, or competitive
intelligence:

### High-Relevance Discoveries

| Project | Stars | Why It Matters |
|---------|-------|---------------|
| **Mastra** (mastra-inc/mastra) | 23K | TypeScript agent framework with workflows, evals, and OpenTelemetry. Closest TS analog to NanoPilot's architecture. |
| **ElizaOS** (elizaOS/ElizaOS) | 18K | Multi-agent TS framework with persistent character memory and Discord/Telegram native. Similar multi-channel approach. |
| **Parlant** (emcie-co/parlant) | 18K | Conversational control layer — separates behavior policy from LLM. Directly relevant to NanoPilot's CLAUDE.md approach. |
| **Langfuse** (langfuse/langfuse) | 17K+ | OSS LLM observability. Self-hostable tracing for every LLM call, tool use, and decision. |
| **RagaAI Catalyst** | 16K | Agent-specific observability with execution graphs and timeline views. |
| **Browser-Use** | 15K+ | OSS browser automation framework. 89% accuracy on WebVoyager. Multi-LLM support. |
| **Open-AutoGLM** | 25K | Phone/mobile GUI automation agent. New modality category entirely. |

### Interesting Forks and Derivatives

| Project/Fork | What's Added |
|-------------|-------------|
| **gyoz-ai/auto-research** | Parallel discovery agents + 7-dimension scoring (already in our audit) |
| **brycealindberg/auto-research-loop** | Metric + task modes, circuit breaker (already in our plan) |
| **Mastra integrations** | 40+ model provider routing via Vercel AI SDK — pattern for NanoPilot model selection |
| **ElizaOS plugins** | 50+ community plugins for APIs, blockchain, media — skill pattern reference |

### Author Networks

Key authors and organizations whose work intersects with NanoPilot's space:
- **Garry Tan** (gstack) — Rapid skill development for Claude Code/Copilot
- **Harrison Chase** (LangChain/LangGraph/LangSmith) — Agent orchestration ecosystem
- **Anthropic engineering** — Context engineering, computer use, constitutional AI
- **Vercel AI team** — AI SDK that powers Mastra's model routing
- **LiveKit team** — Realtime voice AI infrastructure used by OpenAI

---

## Master Prioritization

### Tier 1: Do Now (High Impact, Existing Infrastructure)
1. **Auto-research skill** — Implementation plan exists, 9 todos ready, directly advances autonomy
2. **Agent testing strategy** (Gap 8) — Fix 3 failing tests, then build test pyramid
3. **CI/CD pipeline** (Gap 10) — GitHub Actions for build/test/validate on every PR
4. **Context engineering** (Gap 1) — Design context compilation for container invocations

### Tier 2: Do Next (High Impact, Some New Work)
5. **HTTP API endpoint** — Unlocks 15+ modalities (per interaction-modalities.md)
6. **Structured memory upgrade** — From flat CLAUDE.md to tiered retrieval (per memory-architectures.md)
7. **Token economics** (Gap 7) — Add usage tracking, per-group budgets, model routing
8. **Agent observability** (Gap 2) — OpenTelemetry traces from container-runner

### Tier 3: Strategic (Differentiators)
9. **Gstack skill extraction** — Browse, design-review, benchmark, canary (per gstack-deep-dive.md)
10. **Planning-review pipeline** — CEO/design/eng review cascade (per gstack + autonomy research)
11. **Skill marketplace** (Gap 6) — Publish to GitHub MCP Registry, skill discovery command
12. **Agent identity** (Gap 9) — Global persona + Parlant-style contextual behavior

### Tier 4: Explore Later (Future-Facing)
13. **Voice/realtime agents** (Gap 3) — LiveKit integration for hands-free interaction
14. **Computer use** (Gap 4) — Extend browse skill with screenshot-to-action loops
15. **TypeScript framework study** (Gap 5) — Cherry-pick from Mastra and ElizaOS
16. **Full autopilot** — Depends on Tiers 1-3 being complete (per full-autopilot.md)

### Deprioritized
- Multi-agent orchestration beyond Telegram swarm — premature without structured memory
- Formal benchmarking (SWE-bench etc.) — useful for marketing, not for v1 functionality
- Adversarial multiagent patterns — interesting but NanoPilot is single-agent-focused

---

## Reading Order

For someone new to the NanoPilot research portfolio:

1. **Start here:** `interaction-modalities.md` — Understand the full possibility space
2. **Architecture:** `agent-memory-architectures.md` then `multi-agent-orchestration.md`
3. **Autonomy:** `agent-autonomy-landscape.md` then `nanopilot-full-autopilot.md`
4. **Safety:** `agent-safety-sandboxing.md` then `anthropic-adversarial-multiagent.md`
5. **Implementation:** `auto-research-audit.md` then `auto-research-plan.md`
6. **Ecosystem:** `gstack-deep-dive.md` then `agent-tool-use-mcp.md`
7. **Everything else:** remaining documents in any order
8. **This file:** Re-read INDEX.md after completing the above for full context

---

*This index is a living document. Update it when new research is added or priorities shift.*

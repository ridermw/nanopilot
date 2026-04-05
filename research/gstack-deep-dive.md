# Gstack Deep Dive: Garry Tan's AI Engineering Team

**Date:** 2026-04-05
**Source:** [garrytan/gstack](https://github.com/garrytan/gstack)
**Version analyzed:** v0.15.10.0 (108 releases in 25 days)

---

## Executive Summary

Gstack is the fastest-growing AI developer tooling repo of 2026 — 64,463 stars, 8,782 forks,
108 releases in 25 days (Mar 11 → Apr 5). It turns Claude Code into a virtual software
development team by providing 31+ opinionated skills organized as role-based slash commands.
NanoPilot already vendors some gstack skills (browse, benchmark, canary, careful, codex, cso,
design-review, document-release, freeze, gstack-upgrade). This report audits every skill,
assesses their NanoPilot applicability, and recommends an extraction strategy.

**Key finding:** Gstack's highest-impact innovation is not any single skill but the
**pipeline composition model** (office-hours → plan-ceo-review → plan-eng-review → autoplan →
implement → review → qa → ship → land-and-deploy → canary → retro). NanoPilot should
prioritize extracting the **planning review pipeline** and **learn/checkpoint persistence**
over individual skills.

---

## 1. Repository Vital Signs

| Metric | Value |
|--------|-------|
| Stars | 64,463 |
| Forks | 8,782 |
| Open issues | 320 |
| Created | 2026-03-11 |
| Latest release | v0.15.10.0 (2026-04-05) |
| Total releases | 108 in 25 days (~4.3/day) |
| Size | 80,415 KB |
| Language | TypeScript (Bun runtime) |
| License | MIT |
| Dependencies | playwright, puppeteer-core, diff |
| Dev dependencies | @anthropic-ai/sdk |

### Growth Velocity

```
Date range         Commits (sampled 197 total from API)
Mar 11-19          ~97 commits (v0.0.1 → v0.9.2.0)
Mar 20-31          ~78 commits (v0.9.3 → v0.14.6.0)
Apr 1-5            ~22 commits (v0.15.0.0 → v0.15.10.0)
```

**Key observation:** The repo went from 0 to 108 versions in 25 days. This is an
extraordinarily fast iteration cadence — roughly one new feature or fix every 5-6 hours.
The changelog alone is 189KB. Much of this velocity is AI-assisted (Claude Opus co-authored
commits are visible in early history).

**Inflection points:**
- v0.7.0 (Mar 18): YC Office Hours skill added
- v0.8.0 (Mar 19): Multi-AI (Codex) integration
- v0.9.0 (Mar 19): Multi-host support (Codex, Gemini CLI, Cursor)
- v0.13.6.0 (Mar 29): Learning system
- v0.14.0.0 (Mar 30): Design-to-code pipeline
- v0.14.4.0 (Mar 31): Parallel specialist reviewers
- v0.15.0.0 (Apr 1): Session intelligence
- v0.15.6.0 (Apr 4): Declarative multi-host platform
- v0.15.9.0 (Apr 5): OpenClaw integration v2

---

## 2. Architecture Overview

### Core Design: Markdown Skills + Persistent Browser Daemon

Gstack has two layers:

1. **Skills layer** — Pure Markdown SKILL.md files containing prompts, workflows, and
   decision trees. These are the "brains" — they tell the AI how to behave in each role.
   No code execution. Average size: 30-115KB per skill.

2. **Browser layer** — A compiled Bun binary running a persistent Chromium daemon via
   Playwright. HTTP server on localhost with Bearer token auth. Sub-second commands (~100ms)
   after initial 3s startup. Ring-buffer logging, ref-based element addressing (@e1, @c1),
   cookie import from real browsers.

```
Skills (Markdown prompts)
    ↓ slash commands
Claude Code / Codex / Gemini CLI / Cursor
    ↓ tool calls
Browse daemon (Playwright + Bun HTTP server)
    ↓ CDP
Chromium (persistent, headless or headed)
```

### Host System

Skills are configured per-host via a declarative JSON system (`conductor.json`). Each host
(Claude Code, Codex, Gemini CLI, Cursor, OpenClaw) gets tailored SKILL.md generation:
- `skipSkills` / `includeSkills` — control which skills are available
- `staticFiles` — inject host-specific CLAUDE.md, AGENTS.md
- `overrides.preamble` — host-specific preamble bash scripts

### State Persistence

- `~/.gstack/projects/{slug}/` — per-project learnings, design docs, visions
- `~/.gstack/sessions/` — session tracking (PID files for concurrency)
- `~/.gstack/qa-reports/` — QA report archive
- `~/.gstack/retros/` — retrospective JSON snapshots for trend tracking
- `.gstack/browse.json` — daemon state file (PID, port, token)
- `.gstack/*.log` — ring-buffer log files

---

## 3. Complete Skill Inventory

### Tier 1: Planning Pipeline (Highest Impact)

| Skill | SKILL.md Size | Role | What It Does |
|-------|--------------|------|-------------|
| `/office-hours` | 94KB | YC Partner | 6 forcing questions. Two modes: Startup (interrogative) and Builder (generative). Produces design doc to `~/.gstack/projects/`. Feeds all downstream skills. |
| `/plan-ceo-review` | 111KB | Founder/CEO | "What is the 10-star product hiding inside this request?" Four modes: Expansion, Selective Expansion, Hold Scope, Reduction. Persists visions. |
| `/plan-eng-review` | 83KB | Eng Manager | Architecture, data flow, diagrams, edge cases, trust boundaries. Forces diagramming. Review Readiness Dashboard tracking. |
| `/plan-design-review` | 86KB | Senior Designer | Interactive design review. Rates each dimension 0-10. Explains what a 10 looks like. Works in plan mode. |
| `/plan-devex-review` | 91KB | DX Engineer | Developer experience audit. 8 passes covering API ergonomics, error messages, docs, onboarding. |
| `/autoplan` | 74KB | Pipeline Orchestrator | Runs CEO → Design → Eng reviews sequentially with 6 encoded decision principles. Auto-resolves routine decisions, surfaces "taste decisions" for human approval. |

**NanoPilot relevance: 🟢 HIGH** — The planning pipeline is gstack's crown jewel. These are
pure methodology (Markdown prompts). They would work inside NanoPilot containers as
container skills. The `/autoplan` orchestrator pattern directly maps to NanoPilot's
task scheduler.

### Tier 2: Code Quality & Shipping

| Skill | SKILL.md Size | Role | What It Does |
|-------|--------------|------|-------------|
| `/review` | 75KB | Staff Engineer | Parallel specialist reviewers (security, performance, data migration, etc.). Cross-finding dedup. Test stub suggestions. Adaptive specialist gating. Greptile integration. |
| `/ship` | 115KB | Release Engineer | Sync main, test, coverage audit, test bootstrap, PR creation. Largest skill by size. |
| `/land-and-deploy` | 78KB | Deploy Engineer | Merge PR → wait CI → deploy → canary verify. Platform detection (Fly, Render, Vercel, Netlify, Heroku). |
| `/investigate` | 38KB | Debugger | Systematic root cause analysis. Iron Law: no fixes without investigation. Auto-freezes edits to debug scope. 3-fix limit before stopping. |
| `/document-release` | 43KB | Technical Writer | Post-ship doc sync. Reads all docs, cross-references diff, updates what drifted. |

**NanoPilot relevance: 🟡 MEDIUM** — `/review` and `/investigate` are highly portable.
`/ship` and `/land-and-deploy` are deeply tied to git branch workflows that NanoPilot's
containerized model handles differently (IPC-based, not direct git). `/document-release`
is portable.

### Tier 3: Browser-Powered Skills

| Skill | SKILL.md Size | Role | What It Does |
|-------|--------------|------|-------------|
| `/browse` | 31KB | QA Engineer | Persistent Chromium daemon. Ref-based element addressing. ~100ms per command. Cookie import. Handoff to user for CAPTCHAs. |
| `/qa` | 63KB | QA Lead | Full QA: test app, find bugs, fix with atomic commits, auto-generate regression tests. |
| `/qa-only` | 47KB | QA Reporter | Same as /qa but report-only (no code changes). |
| `/canary` | 38KB | SRE | Post-deploy monitoring. Periodic page checks, console error detection, performance regression. |
| `/benchmark` | 28KB | Performance Engineer | Core Web Vitals baseline + comparison. Multiple runs averaged. Trend tracking. |
| `/design-review` | 77KB | Designer Who Codes | 80-item visual audit + fix loop. Atomic commits with before/after screenshots. |
| `/design-shotgun` | 44KB | Design Explorer | Generate multiple AI design variants, open comparison board, iterate until approved. Taste memory. |
| `/design-html` | 52KB | Design Engineer | Production-quality HTML generation. Pretext-native. Framework detection. |
| `/design-consultation` | 64KB | Design Partner | Full design system from scratch: aesthetic, typography, color, layout, spacing, motion. Creates DESIGN.md. |
| `/open-gstack-browser` | 37KB | Co-Presence | Headed Chromium with sidebar chat. Auto-routes Sonnet (actions) vs Opus (analysis). |
| `/setup-browser-cookies` | 21KB | Session Manager | Import cookies from Chrome/Arc/Brave/Edge via Keychain decryption. |

**NanoPilot relevance: 🟢 HIGH for browse/qa/canary/benchmark** — NanoPilot already vendors
these skills. `/design-review` and `/design-consultation` are promising additions.
`/setup-browser-cookies` is macOS-specific (Keychain), portable to NanoPilot but constrained.
`/design-shotgun` and `/design-html` require OpenAI API (image generation) — may conflict
with NanoPilot's Copilot SDK-only model.

### Tier 4: Safety & Utilities

| Skill | SKILL.md Size | Role | What It Does |
|-------|--------------|------|-------------|
| `/careful` | 2.5KB | Safety Guardrails | Warns before destructive commands. Whitelists common build cleanups. |
| `/freeze` | 3KB | Edit Lock | Directory-scoped edit restriction. |
| `/guard` | 3.2KB | Full Safety | Combines /careful + /freeze. |
| `/unfreeze` | 1.4KB | Unlock | Removes /freeze boundary. |
| `/gstack-upgrade` | — | Self-Updater | Version detection, upgrade, dual-install sync. |
| `/setup-deploy` | 34KB | Deploy Config | One-time platform detection and config writer. |
| `/checkpoint` | 36KB | State Saver | Captures git state, decisions, remaining work for session handoff. |

**NanoPilot relevance: 🟡 MEDIUM** — `/careful`, `/freeze`, `/guard` are already vendored.
`/checkpoint` is interesting — NanoPilot's group CLAUDE.md serves a similar purpose but
the structured checkpoint format could be valuable.

### Tier 5: Intelligence & Memory

| Skill | SKILL.md Size | Role | What It Does |
|-------|--------------|------|-------------|
| `/learn` | 32KB | Institutional Memory | JSONL-based learning persistence. Confidence scoring. Source attribution. File reference tracking. Stale pruning. Cross-session search. Other skills query learnings automatically. |
| `/retro` | 68KB | Eng Manager | Weekly retrospective. Per-person breakdowns. Shipping streaks. Test health trends. JSON snapshots for trend tracking. |
| `/codex` | 54KB | Second Opinion | OpenAI Codex CLI wrapper. Three modes: review (pass/fail gate), challenge (adversarial), consult (open conversation). Cross-model analysis when both Claude and Codex review the same diff. |

**NanoPilot relevance: 🟢 HIGH** — `/learn` maps directly to NanoPilot's per-group CLAUDE.md
memory, but with structured JSONL + confidence scoring + auto-pruning. This is a significant
upgrade path. `/retro` generates excellent operational intelligence. `/codex` cross-model
review is unique and valuable.

### Tier 6: DX & Meta

| Skill | SKILL.md Size | Role | What It Does |
|-------|--------------|------|-------------|
| `/devex-review` | 54KB | DX Reviewer | Developer experience audit. API ergonomics, error messages, docs, onboarding, consistency. |

**NanoPilot relevance: 🟡 MEDIUM** — Useful for NanoPilot's own development but not a
user-facing priority.

### Tier 7: OpenClaw Integration (Newest)

| Skill | Files | What It Does |
|-------|-------|-------------|
| `openclaw/` | 5 files + skills dir | Integration layer for OpenClaw. 4-tier dispatch routing: simple → gstack-lite → specific skill → full pipeline. Native ClawHub skills for office-hours, CEO review, investigate, retro. |

**NanoPilot relevance: 🟢 HIGH** — This is the most significant development. Gstack now
publishes skills to ClawHub for OpenClaw agents. NanoPilot's ClawHub equivalent is the
container skills system. The gstack-lite planning discipline (15 lines, 2x time, better
output) and gstack-full pipeline template are directly portable.

---

## 4. What's Really Good (High-Impact Extractions)

### 4.1 The Planning Review Pipeline

**Impact: 🔴 CRITICAL**

The `/office-hours → /plan-ceo-review → /plan-eng-review → /autoplan` pipeline is gstack's
most valuable innovation. Key insights:

1. **Cognitive gears** — Each review mode activates a fundamentally different thinking
   pattern. CEO mode thinks about product vision. Eng mode thinks about architecture.
   Design mode thinks about user experience. The separation prevents premature optimization.

2. **Autoplan's 6 decision principles** — Prefer completeness, match existing patterns,
   choose reversible options, defer ambiguous items, escalate security, use past decisions
   as precedent. These are codified taste.

3. **Review Readiness Dashboard** — Tracks which reviews have been completed per branch.
   `/ship` checks the dashboard before creating PRs.

4. **Anti-skip rule** — Every review section must be explicitly evaluated, even if it's
   "nothing to flag." Prevents the model from glossing over sections by claiming irrelevance.

**NanoPilot extraction strategy:** Create container skills for the planning pipeline.
The autoplan orchestrator pattern maps to NanoPilot's task scheduler (sequential tasks
with isolated context per review stage). The 6 decision principles and anti-skip rules
are pure methodology — extract and adapt.

### 4.2 The Learning System

**Impact: 🟠 HIGH**

`/learn` provides structured, queryable, prunable institutional memory:

```jsonl
{"pattern": "API responses always wrapped in {data, error} envelope", "confidence": 9, "source": "review@2026-03-28", "files": ["src/api/*"], "created": "2026-03-28"}
```

Key innovations:
- **Confidence scoring** (1-10) — Learnings decay if contradicted
- **File reference tracking** — Detects stale learnings when referenced files are deleted
- **Cross-skill querying** — Other skills (review, investigate, ship) automatically search
  learnings before making recommendations and display "Prior learning applied"
- **Export for team sharing** — Learnings are portable between developers

**NanoPilot extraction:** Currently NanoPilot stores per-group memory in CLAUDE.md (free-text).
The JSONL structured learning format with confidence scoring, auto-pruning, and cross-skill
querying is a significant upgrade. This could live in NanoPilot's SQLite database
(messages table or new learnings table).

### 4.3 Cross-Model Review (/codex)

**Impact: 🟠 HIGH**

The "two doctors, same patient" approach:
- Claude reviews the diff → findings
- Codex reviews the same diff independently → findings
- Cross-model comparison: overlapping findings (high confidence), unique to each (blind spots)

**NanoPilot extraction:** NanoPilot's container model makes this natural. Spawn two
containers: one with Claude (Copilot SDK), one with a different model (if multi-model
support is added). Compare outputs. This requires NanoPilot to support model routing,
which is a v2+ feature.

### 4.4 Persistent Browser Daemon

**Impact: 🟠 HIGH**

Already vendored in NanoPilot. Key gstack innovations worth tracking:
- **Ref staleness detection** — Async `count()` check before using any ref (~5ms vs 30s timeout)
- **Cursor-interactive refs (@c)** — Finds clickable elements not in the ARIA tree
- **Browser handoff** — CAPTCHA/MFA escape hatch (open headed Chrome, user solves, agent resumes)
- **Version auto-restart** — Binary version mismatch triggers automatic daemon restart
- **Ring-buffer logging** — 50K-entry circular buffers for console/network/dialog events

### 4.5 Adaptive Review Specialists

**Impact: 🟡 MEDIUM-HIGH**

v0.14.4.0 introduced parallel specialist reviewers. v0.15.8.0 added:
- **Cross-review finding dedup** — Skip a finding once, it stays quiet until code changes
- **Test stub suggestions** — Skeleton test alongside each finding
- **Adaptive specialist gating** — Specialists with 0 findings after 10 dispatches get auto-gated
- **Per-specialist stats** — Powers adaptive gating and feeds /retro

This is operationally sophisticated. Most code review tools treat every review as independent.
Gstack's reviews learn from your decisions over time.

---

## 5. What's Grown Too Fast (Caution Areas)

### 5.1 Skill Size Inflation

The top skills are enormous:
- `/ship`: 115KB
- `/plan-ceo-review`: 111KB
- `/office-hours`: 95KB
- `/plan-devex-review`: 91KB
- `/plan-design-review`: 86KB
- `/plan-eng-review`: 83KB

These are pure Markdown prompt files. 100KB of prompt engineering is a lot of instructions
for a model to process. There's likely significant redundancy across skills (each includes
preamble code, session management, update checks). The `SKILL.md.tmpl` → `SKILL.md`
generation pipeline adds auto-generated sections that inflate size.

**Risk for NanoPilot:** Extracting these skills means either:
a) Taking the full 100KB prompts (expensive per-container)
b) Distilling to core methodology (requires careful editing to preserve value)

**Recommendation:** Distill. The core methodology of each review skill is probably 5-10KB.
The remaining 90KB is boilerplate, examples, edge case handling, and host-specific
adaptation.

### 5.2 Design Skills Proliferation

Five design-related skills in 25 days:
- `/design-review` (visual audit + fix)
- `/design-shotgun` (variant generation)
- `/design-html` (code generation)
- `/design-consultation` (design system creation)
- `/plan-design-review` (plan-mode review)

These require OpenAI API access (DALL-E for image generation), which conflicts with
NanoPilot's Copilot SDK-only architecture. The design skills also depend heavily on
the browse daemon for screenshot comparison.

**Risk for NanoPilot:** High dependency surface. Moderate value for non-design-heavy
workflows.

**Recommendation:** Extract `/design-review` (useful for any web project) and
`/plan-design-review` (pure methodology). Skip `/design-shotgun`, `/design-html`,
and `/design-consultation` unless design becomes a NanoPilot focus area.

### 5.3 Security Debt

v0.15.7.0 fixed 14 security issues in a single wave:
- Design server bound to 0.0.0.0 (WiFi-accessible)
- Path traversal on /api/reload
- Unauthenticated SSE endpoint
- Prompt injection in design feedback
- World-readable files
- TOCTOU race conditions
- CORS wildcard
- Cookie picker auth bypass
- DNS rebinding
- Symlink bypass

This is normal for fast-growing projects, but indicates the security posture was reactive.
For NanoPilot, this means any extracted code (especially browser/server components)
needs a security review before integration.

### 5.4 OpenClaw Integration Churn

Three versions of OpenClaw integration in 24 hours (v0.15.8.1 → v0.15.9.0 → v0.15.10.0):
- Cleared `includeSkills` and switched to native ClawHub skills
- Rewrote dispatch routing
- Changed from generated skills to hand-crafted methodology

This signals the integration model is still being figured out. NanoPilot should watch
but not adopt the OpenClaw integration patterns until they stabilize.

---

## 6. Gstack vs NanoPilot: Architecture Comparison

| Dimension | Gstack | NanoPilot |
|-----------|--------|-----------|
| **Runtime** | Claude Code sessions (local terminal) | Container VMs (Docker/Apple Container) |
| **Model access** | Claude API + Codex CLI + Gemini CLI | Copilot SDK (GitHub token) |
| **Skill format** | SKILL.md in `~/.claude/skills/` | SKILL.md in `.claude/skills/` (host) + `container/skills/` (container) |
| **State** | Filesystem (`~/.gstack/`) | SQLite + per-group folders |
| **Browser** | Persistent daemon (Playwright/Bun) | Container-internal or shared daemon |
| **Channels** | Terminal (slash commands) | WhatsApp, Telegram, Slack, Discord, Gmail, CLI |
| **Orchestration** | Manual pipeline or /autoplan | Task scheduler (cron, interval, once) |
| **Memory** | JSONL learnings per project | CLAUDE.md per group (free-text) |
| **Isolation** | Same filesystem as user | Container isolation (mounted folders) |
| **Multi-model** | Claude + Codex + Gemini | Copilot SDK only (currently) |

**Key architectural differences:**
1. Gstack skills run in the user's shell environment. NanoPilot skills run in containers.
   This means gstack skills have direct filesystem access; NanoPilot skills work through
   mounted paths and IPC.
2. Gstack is session-scoped (one Claude Code session = one skill invocation). NanoPilot
   is persistent (always-on, message-triggered).
3. Gstack's browse daemon is a shared singleton. NanoPilot's browse capability is
   per-container or per-group.

---

## 7. Extraction Recommendations

### Priority 1: Planning Review Pipeline (Container Skills)

**What to extract:**
- Core methodology from `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`
- The autoplan orchestrator pattern with 6 decision principles
- Anti-skip review rules
- Review Readiness Dashboard concept

**How to adapt for NanoPilot:**
- Create `container/skills/plan-review/` with distilled prompts (5-10KB each, not 100KB)
- Map autoplan to a task scheduler sequence: CEO review → Eng review → Report
- Store review readiness state in group's SQLite (or a JSON file in the group folder)
- Trigger via channel message: "review this plan" → spawns sequential container tasks

**Estimated effort:** Medium (1-2 days). Pure methodology extraction + container adaptation.

### Priority 2: Structured Learning System (Core Feature)

**What to extract:**
- JSONL learning format with confidence scoring
- Auto-pruning of stale learnings (file reference tracking)
- Cross-skill learning queries ("Prior learning applied")

**How to adapt for NanoPilot:**
- Add `learnings` table to SQLite schema (pattern, confidence, source, file_refs, created_at)
- Expose via IPC tool: `store_learning`, `query_learnings`, `prune_learnings`
- Container skills include learning context in prompts
- Prune learnings when referenced files change

**Estimated effort:** Medium (1-2 days). Database schema + IPC tool + container skill update.

### Priority 3: Investigate/Debug Skill (Container Skill)

**What to extract:**
- Systematic root cause methodology (4 phases: investigate, analyze, hypothesize, implement)
- Iron Law: no fixes without investigation
- Auto-freeze to debug scope
- 3-fix limit before stopping

**How to adapt for NanoPilot:**
- Create `container/skills/investigate/SKILL.md`
- The auto-freeze concept translates to constraining container edits to specific mounted paths
- 3-fix limit → IPC message back to host after 3 attempts

**Estimated effort:** Low (0.5-1 day). Mostly prompt engineering.

### Priority 4: Retrospective Skill (Container Skill)

**What to extract:**
- Git history analysis methodology
- Per-person breakdowns
- Shipping streaks and test health trends
- JSON snapshot for trend tracking

**How to adapt for NanoPilot:**
- Create `container/skills/retro/SKILL.md`
- Mount target repo as read-only extra mount
- Output report via IPC message to channel
- Store snapshot in group folder for trend tracking

**Estimated effort:** Low (0.5-1 day). Git commands + methodology prompt.

### Priority 5: Cross-Model Review (Future/v2)

**What to extract:**
- The pattern, not the implementation
- Cross-model finding comparison format (overlap vs unique)
- Severity classification (P1/P2/P3)

**How to adapt for NanoPilot:**
- Requires multi-model support (beyond Copilot SDK)
- Future: spawn two containers with different model backends, compare outputs

**Estimated effort:** High (depends on multi-model infrastructure).

### Skip for Now

| Skill | Why Skip |
|-------|----------|
| `/design-shotgun` | Requires OpenAI API (DALL-E) |
| `/design-html` | Requires OpenAI API + framework detection |
| `/design-consultation` | Requires OpenAI API |
| `/ship` | Too coupled to direct git workflow; NanoPilot has IPC-based shipping |
| `/land-and-deploy` | Platform-specific deploy commands; NanoPilot doesn't manage deploys |
| `/setup-deploy` | One-time config writer; not relevant to NanoPilot's model |
| `/setup-browser-cookies` | macOS Keychain-specific; already vendored where needed |
| `/open-gstack-browser` | Headed browser mode; NanoPilot runs headless in containers |
| `/gstack-upgrade` | Self-updater; NanoPilot has its own update mechanism |
| `/devex-review` | Useful but low priority vs planning pipeline |

---

## 8. Community Ecosystem

### Notable Forks & Adaptations

| Project | Stars | What It Adds |
|---------|-------|-------------|
| [gstack-auto](https://github.com/loperanger7/gstack-auto) | 164 | Semi-autonomous orchestration with product spec → full pipeline |
| [ostack](https://github.com/mr-daedalium/ostack) | 66 | AI-powered engineering team fork |
| [gstack-ko](https://github.com/lucas-flatwhite/gstack-ko) | 39 | Korean localization |
| [cfo-stack](https://github.com/MikeChongCan/cfo-stack) | 13 | AI CFO/Tax skill set inspired by gstack |
| [gstack-codex](https://github.com/huanghfzhufeng/gstack-codex) | 3 | Codex-native port |
| [product-deploy-agents](https://github.com/fasonista71/product-deploy-agents) | 7 | 7-agent pre-release audit pipeline |
| [OG](https://github.com/j23xx/OG) | 2 | Master router for gstack skills |

**Key takeaway:** The community is extracting and recombining gstack skills. `gstack-auto`
(semi-autonomous orchestration) is closest to NanoPilot's model — it wraps gstack skills
in an autonomous loop driven by a product spec.

### OpenClaw Integration

As of v0.15.10.0, gstack publishes 4 native skills to ClawHub:
- `gstack-openclaw-office-hours` (375 lines)
- `gstack-openclaw-ceo-review` (193 lines)
- `gstack-openclaw-investigate` (136 lines)
- `gstack-openclaw-retro` (301 lines)

These are **massively distilled** from the full skills (95KB → 375 lines for office-hours).
This proves the core methodology can be extracted at ~1-3% of the full SKILL.md size.
These OpenClaw-native skills are the ideal starting point for NanoPilot extraction —
they've already been stripped of Claude Code-specific infrastructure.

---

## 9. Strategic Positioning

### What NanoPilot Has That Gstack Doesn't

1. **Always-on presence** — NanoPilot is a persistent service. Gstack is session-scoped.
   Monitor from WhatsApp while in bed. Get alerts on Telegram. No terminal required.

2. **Multi-channel** — WhatsApp, Telegram, Slack, Discord, Gmail. Gstack is terminal-only
   (plus OpenClaw recently).

3. **Container isolation** — NanoPilot agents run in isolated VMs. Gstack runs in the
   user's shell with full filesystem access. NanoPilot is safer for autonomous operations.

4. **Task scheduling** — Cron, interval, and one-shot tasks. Gstack has no scheduler
   (relies on the user invoking skills manually, or autoplan for review pipelines).

5. **Group-based isolation** — Different groups get different memory, different mounts,
   different configurations. Gstack has per-project state but not per-agent isolation.

### What Gstack Has That NanoPilot Doesn't

1. **Planning discipline** — The office-hours → review pipeline is a formalized methodology
   for going from idea to shipping. NanoPilot currently treats each message independently.

2. **Institutional memory with structure** — Confidence-scored, queryable, prunable learnings
   vs NanoPilot's free-text CLAUDE.md.

3. **Cross-model review** — "Two doctors, same patient" with Claude + Codex.

4. **Design pipeline** — Full design system creation → review → iteration → code generation.

5. **Browse ecosystem** — Cookie import, browser handoff, co-presence mode, sidebar chat.

6. **Community momentum** — 64K stars, 8K forks, 320 open issues, active contributor base.

### Complementary, Not Competitive

Gstack and NanoPilot occupy different niches:
- **Gstack** = Interactive coding companion (terminal-centric, session-scoped, developer-facing)
- **NanoPilot** = Autonomous AI assistant (always-on, multi-channel, task-oriented)

The sweet spot is extracting gstack's **methodology** (planning discipline, review rigor,
learning system) into NanoPilot's **infrastructure** (containers, scheduling, multi-channel).
The methodology is the hard part to invent; the infrastructure is the hard part to build.
Each project has what the other needs.

---

## 10. Recommended Extraction Roadmap

### Phase 1: Methodology (Low Risk, High Value)
1. Extract OpenClaw-native skills (already distilled) as starting point
2. Adapt office-hours, CEO review, eng review for container skills
3. Implement autoplan as sequential task scheduler pattern
4. Add anti-skip rules and decision principles

### Phase 2: Memory (Medium Risk, High Value)
5. JSONL learning system → SQLite learnings table
6. Cross-skill learning queries
7. Auto-pruning with file reference tracking

### Phase 3: Operations (Medium Risk, Medium Value)
8. Investigate/debug container skill
9. Retro container skill with trend tracking
10. Document-release container skill

### Phase 4: Advanced (Higher Risk, High Value)
11. Adaptive review specialists (finding dedup, gating)
12. Cross-model review (requires multi-model support)
13. Browser handoff pattern (CAPTCHA/MFA escape)

---

## 11. Key Takeaways

1. **Gstack's velocity is real but creates quality debt.** 108 releases in 25 days means
   many features are still being refined. Wait for stability before extracting complex skills.

2. **The OpenClaw skills are the extraction target.** They're 1-3% the size of the full
   skills, already adapted for non-Claude-Code environments, and proven to work.

3. **The planning pipeline is the most valuable thing.** It's pure methodology — no code
   dependencies. This should be NanoPilot's first extraction.

4. **The learning system is the second most valuable thing.** Structured memory with
   confidence scoring is a significant upgrade from free-text CLAUDE.md.

5. **Skip the design skills unless design becomes a focus.** They have heavy OpenAI API
   dependencies and are specialized for web design workflows.

6. **The browse daemon is excellent and NanoPilot already has it.** Focus on the innovative
   patterns (ref staleness, handoff, adaptive logging) rather than re-extracting the whole thing.

7. **Gstack-auto from the community shows the autonomous pattern.** NanoPilot should study
   `loperanger7/gstack-auto` for ideas on wrapping gstack methodology in autonomous loops.

8. **NanoPilot's competitive advantage is infrastructure.** Always-on, multi-channel,
   container-isolated, scheduled. Gstack's advantage is methodology. Merge both.


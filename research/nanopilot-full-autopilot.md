# NanoPilot Full Autopilot: Self-Owning Repository Architecture

**Date:** 2026-04-05
**Query:** How can NanoPilot own its own repository — reacting to issues, handling PRs, iterating research, verifying changes, and growing the project without adding unnecessary complexity, while staying true to the constitution?

---

## Executive Summary

NanoPilot already possesses roughly 70% of the infrastructure needed to "own itself" — it has container isolation, task scheduling (cron/interval/once), IPC messaging, multi-channel presence, and the Copilot SDK's full tool suite (Bash, Read, Write, Edit, Glob, Grep, WebSearch, Task, TeamCreate). What it lacks are three specific capabilities: (1) **GitHub event ingestion** — listening to issues, PRs, and webhook events, (2) **git write access inside containers** — the NanoPilot project is mounted read-only, and (3) **constitution-aware governance** — a decision framework that prevents autonomous changes from violating the project's principles. This report maps every autonomous operation NanoPilot would need, identifies what exists today, what gaps remain, and proposes a phased architecture that stays true to the constitution's mandate of "small enough to understand."

---

## 1. Architecture Overview: What "Owning the Repo" Means

```
                    ┌─────────────────────────────────────────────┐
                    │              GitHub Repository               │
                    │  Issues  │  PRs  │  Commits  │  Actions     │
                    └────┬─────┴───┬───┴─────┬─────┴─────┬────────┘
                         │         │         │           │
                    ┌────▼─────────▼─────────▼───────────▼────────┐
                    │         GitHub Webhook / Polling              │
                    │  Event ingestion (new issue, PR opened,      │
                    │  PR review requested, CI status, comment)    │
                    └─────────────────────┬────────────────────────┘
                                          │
                    ┌─────────────────────▼────────────────────────┐
                    │           NanoPilot Host Process              │
                    │  Router → Classify → Dispatch to Container   │
                    │  (src/index.ts + new event-router)           │
                    └─────────────────────┬────────────────────────┘
                                          │
                    ┌─────────────────────▼────────────────────────┐
                    │           Container Agent (isolated)          │
                    │  Copilot SDK → GitHub MCP tools → git ops    │
                    │  CLAUDE.md governance rules loaded            │
                    │  /workspace/project (read-only source)       │
                    │  /workspace/workarea (writable clone)        │
                    └─────────────────────┬────────────────────────┘
                                          │ IPC
                    ┌─────────────────────▼────────────────────────┐
                    │           Verification Layer                  │
                    │  Build check │ Test check │ Lint check       │
                    │  Constitution compliance │ Complexity gate    │
                    └──────────────────────────────────────────────┘
```

### The Eight Autonomous Operations

| # | Operation | Trigger | Output |
|---|-----------|---------|--------|
| 1 | Issue triage | New issue opened | Labels, assignment, initial response |
| 2 | Issue resolution | Assigned issue with clear scope | Branch, code changes, PR |
| 3 | PR review | PR opened or review requested | Review comments, approval/request changes |
| 4 | PR iteration | Review feedback on NanoPilot-authored PR | Updated commits addressing feedback |
| 5 | Dependency maintenance | Scheduled (weekly) | Dependency update PRs |
| 6 | Research iteration | Scheduled or issue-triggered | Research docs, committed to research branch |
| 7 | Self-testing | Pre-merge verification | Build + test + lint pass confirmation |
| 8 | Documentation sync | Post-merge | Updated docs matching shipped code |

---

## 2. Current Capabilities Audit

### What NanoPilot Already Has

| Capability | Evidence | Sufficient? |
|-----------|----------|-------------|
| **Task scheduling** | `src/task-scheduler.ts` — cron, interval, once schedules; polls `scheduled_tasks` table every 60s[^1] | ✅ Yes |
| **Container isolation** | `src/container-runner.ts` — Docker/Apple Container with volume mounts, per-group IPC namespaces[^2] | ✅ Yes |
| **IPC messaging** | `src/ipc.ts` — filesystem-based JSON messages, task CRUD, group registration[^3] | ✅ Yes |
| **MCP tools in container** | `container/agent-runner/src/ipc-mcp-stdio.ts` — send_message, schedule_task, list_tasks, register_group[^4] | ✅ Yes |
| **Copilot SDK agent** | `container/agent-runner/src/index.ts` — CopilotClient with full tool access (Bash, Read, Write, Edit, Glob, Grep, WebSearch, Task)[^5] | ✅ Yes |
| **Multi-channel routing** | `src/router.ts` + `src/channels/registry.ts` — WhatsApp, Telegram, Slack, Discord, Gmail[^6] | ✅ Yes |
| **Per-group memory** | `groups/{folder}/CLAUDE.md` — persistent, isolated, writable by container[^7] | ✅ Yes |
| **Session continuity** | Session resume via `client.resumeSession()` with stale session recovery[^8] | ✅ Yes |
| **Script pre-check** | `runScript()` in agent-runner — runs bash script before waking agent, `wakeAgent` boolean gate[^9] | ✅ Yes |
| **Read-only project mount** | Main group mounts project at `/workspace/project` read-only[^10] | ⚠️ Partial — can read code, cannot write |
| **Additional writable mounts** | `additionalMounts` in `RegisteredGroup.containerConfig`[^11] | ✅ Yes |

### What NanoPilot Is Missing

| Gap | Why It Matters | Difficulty |
|-----|---------------|------------|
| **GitHub event ingestion** | No webhook listener or polling for issues/PRs/CI status | Medium — new channel or scheduled task |
| **Git write access to self** | `/workspace/project` is read-only by design; container can't branch/commit/push NanoPilot itself[^10] | Medium — writable clone pattern |
| **`gh` CLI in container** | Container needs `gh` for PR creation, issue management | Low — add to Dockerfile |
| **Constitution-aware governance** | No automated check that proposed changes satisfy the 7 decision tests[^12] | Medium — prompt engineering |
| **Verification pipeline** | No automated build/test/lint gate before pushing | Low — script pre-check pattern exists |
| **Complexity budget** | No metric for "does this make the repo harder to understand" | Medium — heuristic needed |
| **Human approval gate** | For high-risk operations (core changes, constitution amendments) | Low — IPC message + wait for response |

---

## 3. Gap Analysis: Deep Dive

### 3.1 GitHub Event Ingestion

**Current state:** NanoPilot receives messages from chat channels (WhatsApp, Telegram, etc.). It has no native awareness of GitHub repository events.

**Options:**

**Option A: GitHub as a Channel (New Feature Skill)**
Add GitHub as a channel via webhooks or polling. Issues and PRs become "messages" routed through the existing message loop. This is the most NanoPilot-native approach — it treats GitHub like another messaging platform.

```
GitHub webhook → NanoPilot host → stores as message → triggers agent
```

Pros: Uses existing message routing. Cons: Webhooks require a public endpoint or tunnel.

**Option B: Scheduled Polling (No New Infrastructure)**
Use the existing task scheduler to poll GitHub API periodically via `gh` CLI.

```
Cron task (every 5 min) → script checks for new issues/PRs → wakeAgent=true if found
```

Pros: Zero new infrastructure. Works with existing `script` + `wakeAgent` pattern[^9]. Cons: 5-minute latency, API rate limits.

**Option C: GitHub Actions as Trigger**
A `.github/workflows/` action fires on issue/PR events, sends a message to NanoPilot via its channel (e.g., Telegram bot message or direct API call).

```
GitHub Action → curl NanoPilot endpoint or send Telegram message → agent wakes
```

Pros: Real-time, no public endpoint needed. Cons: External dependency on GitHub Actions.

**Recommendation:** Start with **Option B** (polling) for simplicity, evolve to **Option A** when NanoPilot needs real-time response. Option B requires zero core changes — it's just a scheduled task with a script. This is the most constitution-aligned approach (Principle 6: "Prefer boring tools and minimal glue")[^12].

### 3.2 Git Write Access to Self

**Current state:** The main group mounts `process.cwd()` (the NanoPilot project root) at `/workspace/project` as **read-only**[^10]. This is a deliberate security decision — comment in `container-runner.ts` says: "Read-only prevents the agent from modifying host application code (src/, dist/, package.json, etc.) which would bypass the sandbox entirely on next restart."

**The tension:** Self-ownership requires the agent to modify its own code. But direct write access to the running NanoPilot instance is unsafe — a bad commit could break the host process.

**Solution: Writable Clone Pattern**

The agent doesn't need write access to the *running* NanoPilot. It needs write access to a *git worktree or clone* of NanoPilot that it can branch, modify, test, and push — without affecting the running process.

```
/workspace/project        ← read-only mount (running NanoPilot source)
/workspace/extra/nanopilot-dev  ← writable mount (git worktree or clone)
```

Implementation:
1. Create a git worktree at a known path (e.g., `~/nanopilot-dev` or `../nanopilot-dev`)
2. Configure the main group's `additionalMounts` to mount it writable:
   ```json
   {
     "additionalMounts": [{
       "hostPath": "~/nanopilot-dev",
       "containerPath": "nanopilot-dev",
       "readonly": false
     }]
   }
   ```
3. Add the worktree path to `mount-allowlist.json` with `allowReadWrite: true`
4. Agent works in `/workspace/extra/nanopilot-dev`: branch, edit, test, commit, push
5. PR is created via `gh pr create` — human reviews and merges

**This pattern already exists** — the research worktree at `../nanopilot-research` uses exactly this approach[^13]. The container `additionalMounts` system was designed for this use case[^11].

### 3.3 Constitution-Aware Governance

**The hardest problem.** The constitution defines 7 decision tests[^12]. An autonomous agent must internalize these:

1. Does almost every NanoPilot user need this?
2. Does this make the repo easier to understand, or at least not harder?
3. Does this preserve security through isolation?
4. Could this be a skill instead of a core change?
5. Does this reduce or expand configuration sprawl?
6. Are we reusing proven tools, or inventing new infrastructure?
7. Are the docs still telling one coherent story?

**Approach: Constitution as System Prompt + Pre-Flight Check**

The agent's CLAUDE.md (group memory) includes the full constitution. Before creating any PR, the agent must:

1. Run a **pre-flight checklist** that evaluates each decision test
2. Classify the change: core (bug fix, security fix, simplification) vs. skill vs. wrong for NanoPilot
3. If the change is "usually wrong for NanoPilot," **stop and report** instead of proceeding
4. Include the checklist results in the PR description

This is pure prompt engineering — no code changes to core. The governance rules live in the group's CLAUDE.md and container skill prompts.

**Complexity Budget Heuristic:**

To operationalize "does this make the repo easier to understand," measure:
- Lines of code added vs. removed (net positive = more complex)
- New files created (each new file is a comprehension cost)
- New dependencies added (each dep is a maintenance cost)
- New configuration options (each knob is a decision the user must make)

A simple script can compute these metrics from a git diff and include them in the pre-flight report.

### 3.4 The `gh` CLI Gap

The container Dockerfile currently installs Node.js, npm, the Copilot SDK, and basic tools. It does not include `gh` (GitHub CLI). Adding it is a one-line change:

```dockerfile
RUN apt-get update && apt-get install -y gh
```

Or install via the official method during container build. This gives the agent `gh issue`, `gh pr`, `gh api` commands for all GitHub operations.

---

## 4. The Autonomous Operations — Detailed Design

### 4.1 Issue Triage (Reactive)

**Trigger:** Scheduled poll every 5 minutes, or GitHub Action notification
**Script phase:** `gh issue list --repo ridermw/nanopilot --state open --label "" --json number,title,body,labels --limit 10` → filter untriaged issues → `wakeAgent=true` if any found

**Agent actions:**
1. Read the issue title and body
2. Classify: bug report, feature request, skill request, question, constitution amendment
3. Apply labels via `gh issue edit --add-label`
4. For bugs: check if the issue is reproducible by reading referenced code
5. For feature requests: evaluate against the 7 decision tests
6. Post an initial triage comment with classification and next steps
7. For clear, small bugs: auto-assign to self and create a branch

**Constitution alignment:** Issue triage is a simplification (reduces human overhead). It doesn't add code to core. It's a scheduled task + container skill — pure skill territory[^12].

### 4.2 Issue Resolution (Proactive)

**Trigger:** Issue assigned to NanoPilot (detected by polling), or command from human via channel ("fix issue #42")
**Prerequisite:** Writable clone at `/workspace/extra/nanopilot-dev`

**Agent actions:**
1. Read the issue and all comments
2. Read the relevant source code from `/workspace/project` (read-only reference)
3. Create a branch in the writable clone: `git checkout -b fix/issue-42`
4. Make changes, run `npm run build`, run `npm test`
5. If build/tests pass: commit, push, create PR via `gh pr create`
6. If build/tests fail: iterate up to 3 times (investigate pattern from gstack[^14])
7. Link the PR to the issue: `gh pr edit --add-issue 42`
8. Report status back to the channel via IPC `send_message`

**Constitution gate:** Before creating the PR, run the pre-flight checklist:
- Is this a bug fix, security fix, or simplification? → Proceed
- Is this a feature or enhancement? → Stop, report "this should be a skill"
- Does it add new dependencies? → Flag for human review

### 4.3 PR Review (Reactive)

**Trigger:** New PR opened by external contributor (detected by polling)

**Agent actions:**
1. Read the PR diff via `gh pr diff`
2. Read the changed files from the repository
3. Evaluate against constitution decision tests
4. Check for: test coverage, build passing, complexity budget
5. Post review comments via `gh pr review --comment` or `--request-changes`
6. For trivial fixes (typos, doc updates): approve via `gh pr review --approve`

**Human override:** Agent never merges PRs. It reviews and recommends. The human maintains merge authority.

### 4.4 PR Iteration (Self-Correcting)

**Trigger:** Review comments on a NanoPilot-authored PR

**Agent actions:**
1. Read review comments via `gh pr view --comments`
2. Understand the feedback in context of the original changes
3. Make corrections in the writable clone
4. Push updates to the same branch
5. Respond to review comments with what was changed
6. Re-run build/test verification

**3-strike rule:** If the same PR gets 3 rounds of "request changes," the agent marks the issue as "needs human" and stops iterating. This prevents infinite loops.

### 4.5 Dependency Maintenance (Scheduled)

**Trigger:** Weekly cron task

**Agent actions:**
1. Run `npm outdated` in the writable clone
2. For patch/minor updates: create a branch, update, test, PR
3. For major updates: report to channel without auto-updating
4. Run `npm audit` and create PRs for security patches immediately

**Constitution alignment:** Dependency updates are maintenance (boring tools, Principle 6). They reduce security risk without adding complexity.

### 4.6 Research Iteration (Scheduled)

**Trigger:** Scheduled task or channel command ("research X")

**Agent actions:**
1. Use WebSearch to gather information
2. Write research document
3. Commit to research worktree
4. Push and create PR

**This already works.** The current session has demonstrated this exact flow across 14 research documents[^13]. The only missing piece is making it a scheduled task instead of a manual command.

### 4.7 Self-Testing (Verification Gate)

**Trigger:** Pre-PR step in any autonomous code change

**Agent actions:**
1. `npm run build` — TypeScript compilation
2. `npm test` — Vitest test suite
3. ESLint check
4. Complexity metrics (LOC delta, file count delta, dep count delta)
5. If any fail: fix and retry (up to 3 attempts)
6. If all pass: include results in PR description

**Script implementation:** This uses the existing `runScript()` + `wakeAgent` pattern[^9]:

```bash
#!/bin/bash
cd /workspace/extra/nanopilot-dev
npm run build 2>&1 && npm test 2>&1
if [ $? -eq 0 ]; then
  echo '{"wakeAgent": true, "data": {"build": "pass", "test": "pass"}}'
else
  echo '{"wakeAgent": true, "data": {"build": "fail", "error": "Build or tests failed"}}'
fi
```

### 4.8 Documentation Sync (Post-Merge)

**Trigger:** Detect merged PR (via polling)

**Agent actions:**
1. Read the merged diff
2. Check README.md, CLAUDE.md, CONTRIBUTING.md, docs/ for stale references
3. If stale content found: create a doc-update PR
4. If no staleness: report "docs are current" to channel

---

## 5. Does NanoPilot Have Sufficient Agency? Gap Matrix

| Autonomous Operation | Container Isolation | Scheduling | IPC | Git Access | GitHub API | Governance | **Ready?** |
|---------------------|--------------------|-----------|----|-----------|-----------|-----------|-----------|
| Issue triage | ✅ | ✅ | ✅ | ❌ needs `gh` | ❌ needs `gh` | ✅ (prompt) | **75%** |
| Issue resolution | ✅ | ✅ | ✅ | ❌ writable clone | ❌ needs `gh` | ✅ (prompt) | **60%** |
| PR review | ✅ | ✅ | ✅ | ❌ needs `gh` | ❌ needs `gh` | ✅ (prompt) | **70%** |
| PR iteration | ✅ | ✅ | ✅ | ❌ writable clone | ❌ needs `gh` | ✅ (prompt) | **60%** |
| Dependency maint. | ✅ | ✅ | ✅ | ❌ writable clone | ❌ needs `gh` | ✅ (prompt) | **60%** |
| Research iteration | ✅ | ✅ | ✅ | ✅ (research worktree) | ✅ (already works) | ✅ | **95%** |
| Self-testing | ✅ | ✅ | ✅ | ❌ writable clone | N/A | ✅ | **70%** |
| Documentation sync | ✅ | ✅ | ✅ | ❌ writable clone | ❌ needs `gh` | ✅ (prompt) | **60%** |

### The Three Missing Pieces (Everything Else Exists)

1. **`gh` CLI in container** — 1 Dockerfile line
2. **Writable NanoPilot clone/worktree** — 1 mount configuration + allowlist entry
3. **Governance prompts** — CLAUDE.md additions (zero code changes)

**That's it.** Three changes — one infrastructure, one config, one prompt — unlock all 8 autonomous operations. NanoPilot's existing architecture was designed for exactly this kind of extension.

---

## 6. Constitution Compliance Analysis

The central question: **Does making NanoPilot self-managing violate its own constitution?**

### Test 1: "Does almost every NanoPilot user need this?"

**No.** Most NanoPilot users want a personal assistant, not a self-managing repo. Self-ownership is specific to NanoPilot's own development.

**Implication:** This should be a **skill**, not a core change. All the autonomous operations should be implemented as:
- Container skills (SKILL.md prompts for governance, triage, review)
- Scheduled tasks (configured via IPC, not hardcoded)
- Mount configuration (additionalMounts, not code changes)
- One Dockerfile addition (`gh` CLI)

The only core change is adding `gh` to the container image — and even that could be optional.

### Test 2: "Does this make the repo easier to understand?"

**Yes, if implemented as skills.** The core remains unchanged. The self-management behavior is encapsulated in:
- `container/skills/repo-governance/SKILL.md`
- `groups/main/CLAUDE.md` (governance rules)
- Scheduled tasks in the database

No new processes, no new state, no new indirection.

### Test 3: "Does this preserve security through isolation?"

**Yes.** The agent works in a container with:
- Read-only access to the running NanoPilot (can't break the host)
- Writable access only to a separate clone (sandboxed)
- IPC authorization (main group only can send cross-group messages)[^3]
- GitHub token scoped to the repository (can't access other repos)

### Test 4: "Could this be a skill instead of a core change?"

**Yes, entirely.** The `gh` CLI addition is the only change to the Dockerfile. Everything else is skills + configuration.

### Test 5: "Does this reduce or expand configuration sprawl?"

**Minimal expansion.** One new mount in `additionalMounts`, one allowlist entry. No new .env variables, no new flags.

### Test 6: "Are we reusing proven tools?"

**Yes.** `gh` CLI is GitHub's official tool. Git worktrees are standard git. Scheduled tasks use the existing scheduler. IPC uses the existing IPC system. The Copilot SDK provides the agent intelligence.

### Test 7: "Are the docs telling one coherent story?"

**Yes, if documented.** A `docs/self-management.md` explains the architecture. CLAUDE.md references the constitution. The CONTRIBUTING.md already describes skill types — this is a new container skill.

**Verdict: Constitutional.** The self-management architecture passes all 7 decision tests by implementing everything as skills and configuration rather than core changes.

---

## 7. Staying True: Complexity Prevention Mechanisms

### 7.1 The Complexity Budget

Before any autonomous PR, compute:

```
Δ complexity = (lines_added - lines_removed) + (files_added × 50) + (deps_added × 100) + (config_keys_added × 25)
```

- If Δ complexity > 0 and the change is a feature: **reject** (should be a skill)
- If Δ complexity > 0 and the change is a bug fix: **flag** for human review
- If Δ complexity ≤ 0: **proceed** (simplification)

### 7.2 The Anti-Slop Guard

For code changes, the agent must verify:
- No new dependencies unless security-critical
- No new configuration keys unless removing an existing one
- No new processes or daemons
- No new abstraction layers
- Tests cover the change

### 7.3 The 3-Strike Rule

If an autonomous change is rejected by human review 3 times:
1. The agent marks the issue as "needs human design"
2. Reports to the channel: "I've tried 3 approaches and they were all rejected. This needs your input."
3. Does not attempt again until explicitly asked

### 7.4 The Revert Safety Net

Every autonomous PR includes a revert instruction:
```
To revert: git revert <commit-sha>
```

The agent should never make changes that are hard to revert (database migrations, breaking API changes, irreversible state transitions).

---

## 8. Phased Implementation Roadmap

### Phase 0: Foundation (Zero Core Changes)

**What:** Configure the writable clone and governance prompts.

1. Create a git worktree: `git worktree add ../nanopilot-dev main`
2. Add to mount-allowlist.json:
   ```json
   {"path": "~/nanopilot-dev", "allowReadWrite": true, "description": "NanoPilot development clone"}
   ```
3. Configure main group's `additionalMounts`:
   ```json
   {"hostPath": "~/nanopilot-dev", "containerPath": "nanopilot-dev", "readonly": false}
   ```
4. Add governance rules to `groups/main/CLAUDE.md`
5. Add `gh` CLI to container Dockerfile

**Changes:** 0 lines of NanoPilot TypeScript code. 1 Dockerfile line. Config + prompts only.

### Phase 1: Reactive Operations (Issue Triage + PR Review)

**What:** Scheduled tasks that poll GitHub and respond.

6. Create scheduled task: "Every 5 min, check for new issues, triage untriaged ones"
7. Create scheduled task: "Every 5 min, check for new PRs, post review comments"
8. Create container skill: `container/skills/repo-governance/SKILL.md` with constitution checklist

**Changes:** 1 new container skill (SKILL.md only). 2 scheduled tasks (database rows, no code).

### Phase 2: Proactive Operations (Issue Resolution + Doc Sync)

**What:** Agent creates branches, makes changes, opens PRs.

9. Extend governance skill with branch/commit/push workflow
10. Add pre-flight verification script (build + test + complexity check)
11. Create scheduled task: "After PR merge, check for stale docs"
12. Create scheduled task: "Weekly dependency audit"

**Changes:** Expanded skill prompt. 1 new bash script. 2 more scheduled tasks.

### Phase 3: Self-Improvement Loop (Research + Learning)

**What:** Agent identifies improvement opportunities and researches them.

13. Scheduled task: "Weekly, scan TODOS.md and issues for actionable items"
14. Scheduled task: "Monthly, run complexity analysis and report trends"
15. Learning system: structured JSONL learnings (from gstack research[^15])
16. Research iteration: "Quarterly, research relevant developments in agent ecosystem"

**Changes:** 2 more scheduled tasks. Optional: learnings table in SQLite.

### Phase 4: Full Autonomy (With Human Guardrails)

**What:** Agent handles the full lifecycle with minimal human intervention.

17. Human approval gate: high-risk operations send a message to the channel and wait for "approved" before proceeding
18. Auto-merge for trivial changes (doc typos, dependency patches) with `gh pr merge --auto`
19. Self-testing: agent runs its own tests before and after changes
20. Constitution amendment proposals: agent can suggest amendments, human must approve

**Key constraint:** The human retains:
- Merge authority for all non-trivial PRs
- Constitution amendment authority
- Ability to pause/cancel any autonomous task
- Ability to revert any change

---

## 9. External Reference: How Others Do This

### GitHub Copilot Coding Agent (Native)
GitHub's own coding agent can be assigned issues via API, creates PRs, and iterates on review feedback. It runs in GitHub Actions with sandboxed execution. NanoPilot's approach is similar but self-hosted and more customizable[^16].

### GitHub Agentic Workflows (2026 Preview)
GitHub announced agentic workflows that describe goals in Markdown and AI agents execute them inside Actions. This validates the "prompt-based governance" approach — define goals in docs, let the agent figure out implementation[^17].

### Gstack's Autoplan Pipeline
Gstack's `/autoplan` runs CEO → Design → Eng reviews sequentially with encoded decision principles. NanoPilot's constitution checklist is the same pattern — encode governance rules, let the agent self-evaluate[^15].

### Karpathy's Autoresearch
Iterative research loops with metric-driven evaluation. NanoPilot's research iteration (Phase 3) follows this pattern — scheduled research with structured output[^18].

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent introduces a bug | Medium | High | Writable clone is separate from running instance; build+test gate; human reviews PR |
| Agent creates unnecessary PRs | Medium | Low | Complexity budget rejects net-positive-complexity changes |
| Agent violates constitution | Low | High | Constitution loaded as system prompt; pre-flight checklist; human merge authority |
| Agent enters infinite loop | Low | Medium | 3-strike rule; scheduled task timeout (30 min)[^1]; human can pause via IPC |
| Agent leaks secrets | Very Low | Critical | Token passed via stdin, never in env vars[^5]; .env shadowed with /dev/null[^10]; token redaction in logs |
| Agent breaks running NanoPilot | Very Low | Critical | Project mounted read-only[^10]; agent works only in separate writable clone |
| Runaway API costs | Low | Medium | Copilot SDK uses GitHub token (included in subscription); no external API calls |

---

## 11. Key Insight: NanoPilot's Architecture Was Built for This

The most striking finding from this analysis is that NanoPilot's architecture was *already designed* for autonomous self-management, even if that wasn't the explicit intent:

1. **Container isolation** means the agent can't break the running host, even if it tries
2. **IPC messaging** means the agent can communicate results without direct access to the host process
3. **Task scheduling** means autonomous operations can run on a cadence without human triggers
4. **Script pre-check** means expensive agent invocations can be gated by cheap bash scripts
5. **Additional mounts** mean the agent can access arbitrary directories (with allowlist protection)
6. **Session continuity** means multi-turn operations can maintain context across interactions
7. **Main group privileges** mean only the authorized "control channel" can perform elevated operations

The gap is not architectural — it's **intentional restriction** (read-only project mount) and **missing tooling** (`gh` CLI, governance prompts). The restrictions are correct and should stay. The writable clone pattern respects them while enabling autonomous operations.

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| NanoPilot has ~70% of needed infrastructure | High | Direct source code audit of all listed files |
| Only 3 changes needed for basic self-management | High | Verified: gh CLI, writable clone, governance prompts |
| Constitution is not violated by skill-based implementation | High | Evaluated against all 7 decision tests with citations |
| Writable clone pattern works | High | Already demonstrated with research worktree |
| Polling-based event ingestion is sufficient for v1 | Medium | Depends on latency requirements; may need webhooks later |
| Complexity budget formula is useful | Medium | Heuristic, needs calibration against real PRs |
| 3-strike rule prevents infinite loops | Medium | Reasonable default, may need tuning |

**Key assumption:** The GitHub token (`COPILOT_GITHUB_TOKEN`) has sufficient permissions for `gh` CLI operations (issue management, PR creation, push). If it's scoped to Copilot only, a separate token or GitHub App may be needed for repo write operations.

---

## Footnotes

[^1]: `src/task-scheduler.ts:36-68` — computeNextRun() handles cron, interval, and once schedule types; `SCHEDULER_POLL_INTERVAL` = 60000ms in `src/config.ts:22`
[^2]: `src/container-runner.ts:59-200` — buildVolumeMounts() with per-group IPC namespaces at `/workspace/ipc`
[^3]: `src/ipc.ts:30-468` — IPC watcher with authorization checks: main groups can send cross-group, non-main groups only to self
[^4]: `container/agent-runner/src/ipc-mcp-stdio.ts:37-80` — MCP server with send_message, schedule_task tools
[^5]: `container/agent-runner/src/index.ts:389-400` — githubToken from ContainerInput via stdin, FATAL if missing
[^6]: `src/router.ts:44-59` — routeOutbound() and findChannel() for multi-channel routing
[^7]: `src/container-runner.ts:99-104` — group folder mounted writable at /workspace/group
[^8]: `container/agent-runner/src/index.ts:522-540` — session resume with stale session fallback
[^9]: `container/agent-runner/src/index.ts:242-295` — runScript() returns `{wakeAgent: boolean, data?: unknown}`
[^10]: `src/container-runner.ts:67-77` — Main group project root mounted read-only with security comment
[^11]: `src/types.ts:1-33` — AdditionalMount interface with hostPath, containerPath, readonly fields
[^12]: `CONSTITUTION.md:100-136` — Seven decision tests and practical outcomes
[^13]: Research worktree at `../nanopilot-research` on `research/all` branch — demonstrated across 14 research documents in this session
[^14]: Gstack `/investigate` skill uses Iron Law (no fixes without investigation) and 3-fix limit — `research/gstack-deep-dive.md`
[^15]: Gstack deep dive research: autoplan pipeline, learning system — `research/gstack-deep-dive.md`
[^16]: [GitHub Copilot Coding Agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents) — assigns issues to agents, creates PRs
[^17]: [GitHub Agentic Workflows](https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/) — Markdown-defined goals, AI execution
[^18]: Auto-research audit — `research/auto-research-audit.md`

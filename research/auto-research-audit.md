# Auto-Research Skill for NanoPilot: Design Research Report

## Executive Summary

Andrej Karpathy's [karpathy/autoresearch](https://github.com/karpathy/autoresearch) repo implements a minimal but powerful pattern: an autonomous AI agent modifies code, runs a time-boxed experiment, evaluates a single metric, and keeps or discards the change — looping indefinitely on a dedicated git branch[^1]. The repo is only 3 meaningful files (~630 lines of Python), yet the pattern has spawned 30+ community forks and adaptations[^2]. This report audits the original repo thoroughly, surveys two community adaptations that packaged the pattern as Claude Code skills ([gyoz-ai/auto-research](https://github.com/gyoz-ai/auto-research) and [brycealindberg/auto-research-loop](https://github.com/brycealindberg/auto-research-loop)), and designs what a NanoPilot skill should look like — mapping autoresearch's concepts onto NanoPilot's container architecture, IPC system, task scheduler, and channel-based reporting.

---

## 1. Karpathy's Autoresearch — Full Audit

### 1a. Repository Structure

The repo is intentionally minimal[^3]:

```
karpathy/autoresearch/
├── prepare.py        # Fixed: data prep, tokenizer, dataloader, evaluation (READ-ONLY)
├── train.py          # Mutable: GPT model, optimizer, training loop (AGENT MODIFIES)
├── program.md        # Agent instructions / "research org code" (HUMAN MODIFIES)
├── analysis.ipynb    # Post-hoc analysis notebook
├── pyproject.toml    # Dependencies (PyTorch, kernels, rustbpe, tiktoken)
├── .gitignore        # Ignores results.tsv, CLAUDE.md, AGENTS.md, worktrees/
├── .python-version   # Python version pin
├── progress.png      # Example results visualization
└── uv.lock           # Dependency lock file
```

| File | Lines | Role | Who Edits |
|------|-------|------|-----------|
| `prepare.py` | ~330 | Constants, data download, tokenizer training, dataloader, `evaluate_bpb()` | **Nobody** (read-only) |
| `train.py` | ~630 | Full GPT model, Muon+AdamW optimizer, training loop | **Agent only** |
| `program.md` | ~130 | Agent instructions: setup, experiment loop, logging format | **Human only** |

### 1b. The Core Loop (from `program.md`)

The experiment loop is the heart of autoresearch[^4]:

```
LOOP FOREVER:
  1. Look at git state (current branch/commit)
  2. Modify train.py with an experimental idea
  3. git commit
  4. Run: uv run train.py > run.log 2>&1
  5. Extract results: grep "^val_bpb:\|^peak_vram_mb:" run.log
  6. If grep empty → crashed. tail -n 50 run.log for stack trace. Fix or skip.
  7. Log to results.tsv (commit, val_bpb, memory_gb, status, description)
  8. If val_bpb improved → KEEP (advance branch)
  9. If val_bpb same or worse → DISCARD (git reset)
```

**Critical design constraints:**
- **Fixed 5-minute time budget** (wall clock, excluding startup/compilation)[^5]
- **Single metric**: `val_bpb` (validation bits per byte) — lower is better, vocab-size-independent[^6]
- **Single file modification**: only `train.py` may change[^7]
- **Never stop**: agent runs indefinitely until manually interrupted[^8]
- **Simplicity criterion**: "A 0.001 val_bpb improvement that adds 20 lines of hacky code? Probably not worth it."[^9]

### 1c. The Metric & Evaluation

`prepare.py` contains the fixed evaluation function `evaluate_bpb()`[^10]:

```python
@torch.no_grad()
def evaluate_bpb(model, tokenizer, batch_size):
    """
    Bits per byte (BPB): vocab size-independent evaluation metric.
    Sums per-token cross-entropy (in nats), sums target byte lengths,
    then converts nats/byte to bits/byte. Special tokens excluded.
    """
    # Uses fixed MAX_SEQ_LEN (2048) and EVAL_TOKENS (40 * 524288)
    # for comparable results across configs
```

Key constants from `prepare.py`[^11]:
- `MAX_SEQ_LEN = 2048` (context length)
- `TIME_BUDGET = 300` (5 minutes)
- `EVAL_TOKENS = 40 * 524288` (~20M tokens for validation)
- `VOCAB_SIZE = 8192`

### 1d. Results Logging Format

Tab-separated, NOT comma-separated[^12]:

```
commit	val_bpb	memory_gb	status	description
a1b2c3d	0.997900	44.0	keep	baseline
b2c3d4e	0.993200	44.2	keep	increase LR to 0.04
c3d4e5f	1.005000	44.0	discard	switch to GeLU activation
d4e5f6g	0.000000	0.0	crash	double model width (OOM)
```

**Important**: `results.tsv` is NOT committed — it stays untracked[^13].

### 1e. Branch Strategy

Each experiment run creates a branch `autoresearch/<tag>` (e.g., `autoresearch/mar5`)[^14]. The branch advances linearly — only successful improvements survive in the commit history. Failed experiments are `git reset` away, leaving no trace in the branch.

### 1f. What Karpathy Got Right (Design Principles)

| Principle | Implementation | Why It Works |
|-----------|---------------|-------------|
| **Minimal scope** | One mutable file | Keeps diffs reviewable, prevents runaway complexity |
| **Fixed time budget** | 5 min wall clock | Makes experiments comparable regardless of what agent changes |
| **Single metric** | val_bpb | Unambiguous keep/discard decision |
| **Git as memory** | Branch + commit/reset | Clean history, reproducible state |
| **Simplicity pressure** | Explicit in program.md | Prevents complexity ratchet |
| **Never stop** | Explicit in program.md | Autonomy without babysitting |
| **Read-only evaluation** | prepare.py is untouchable | Agent can't game the metric |

---

## 2. Community Adaptations as Skills

### 2a. gyoz-ai/auto-research — Skill Improvement Agent

[gyoz-ai/auto-research](https://github.com/gyoz-ai/auto-research) adapts autoresearch specifically for **improving Claude Code skills**[^15].

**Key Innovation**: Instead of optimizing a neural network, it optimizes a SKILL.md file using **5 parallel research agents** + keep/discard loop.

**Architecture (5 phases)**[^16]:

```
Phase 1: Discovery     → Read skill, extract metadata, create backup
Phase 2: Research       → 5 parallel agents (domain expert, quality auditor,
                          competitive analyst, gap analyst, tech scout)
Phase 3: Synthesis      → De-duplicate, score: Priority = Impact × Confidence / Complexity
Phase 4: Improve Loop   → Apply one change → evaluate → keep/discard → repeat
Phase 5: Results Report → Before/after quality scores, experiment log
```

**Parallel Agent Roles**[^17]:

| Agent | Focus | Method |
|-------|-------|--------|
| Domain Expert | Best practices, conventions | Web search for guides/docs |
| Quality Auditor | Score on 7 dimensions (1-10) | Structural analysis |
| Competitive Analyst | How others solve similar problems | Search cursor rules, AI prompts |
| Gap Analyst | Missing scenarios, edge cases | User journey analysis |
| Tech Scout | Outdated/deprecated content | Changelog research |

**Quality Dimensions (scored 1-10)**[^18]:
1. Actionability — Can Claude immediately act?
2. Clarity — Is language unambiguous?
3. Completeness — Full workflow coverage?
4. Examples — Enough concrete examples?
5. Edge Cases — Failure modes handled?
6. Conciseness — Every line earns its place?
7. Trigger Accuracy — Description matches activation?

**The keep/discard evaluation criteria**[^19]:
- Accuracy: Is the new content factually correct?
- Clarity: Clearer than before, or adds confusion?
- Value-add: Genuinely helps Claude perform better?
- Simplicity: Keeps skill lean, or adds bloat?

### 2b. brycealindberg/auto-research-loop — General-Purpose Loop Engine

[brycealindberg/auto-research-loop](https://github.com/brycealindberg/auto-research-loop) generalizes autoresearch into a domain-independent autonomous iteration engine[^20].

**Key Innovation**: Two modes (metric optimization + task completion) + fresh context per iteration via bash launcher.

**Two Modes**[^21]:

| | Metric Mode | Task Mode |
|---|---|---|
| For | Optimizing a number | Completing a task |
| Decision | Metric improved → keep. Worse → `git revert` | Accumulate work |
| Exit | Max iterations or manual stop | Completion promise met + gates pass |
| Example | "Get test coverage to 90%" | "Build auth system with JWT" |

**Infrastructure**[^22]:
- `scripts/run-loop.sh` — Spawns fresh `claude -p` per iteration (avoids context exhaustion)
- `.claude/auto-research-loop-scratchpad.md` — Persistent memory across iterations
- `.claude/auto-research-loop-log.jsonl` — Structured logging (15 fields + cost estimates)
- `autoresearch-results.tsv` — Experiment journal
- Stop hook — Mechanically blocks exit and re-feeds the prompt
- Circuit breaker — Auto-stops after N consecutive stalled iterations

**Safety Features**[^23]:
- Auto-branch creation (never touches main)
- `--read-only` flag protects evaluation files
- Circuit breaker on consecutive failures
- 30-minute iteration timeout
- Task mode never reverts (accumulates)

**Domain Examples**[^24]:

| Domain | Metric | Verify Command |
|--------|--------|----------------|
| Test coverage | % coverage | `pytest --cov \| grep TOTAL` |
| Bundle size | KB | `npm run build \| grep size` |
| ML training | val_bpb | `uv run train.py \| grep val_bpb` |
| Performance | ms p95 | `npm run bench \| grep p95` |
| Lighthouse | score | `npx lighthouse --quiet --output json \| jq ...` |

---

## 3. NanoPilot Skill Design

### 3a. Architecture Mapping

NanoPilot's architecture requires a different approach than Claude Code plugins. Key differences:

| Autoresearch (Claude Code) | NanoPilot Equivalent |
|---------------------------|---------------------|
| Direct CLI access to git/shell | Containerized agents with mounted volumes |
| Single long-running session | Container spawned per prompt (container-runner.ts) |
| Conversation context | Per-group CLAUDE.md + session files |
| Console output | IPC messages → channel (WhatsApp/Telegram/etc.) |
| Claude Code stop hook | NanoPilot task scheduler (cron/interval) |
| Claude Code slash commands | NanoPilot skills (SKILL.md) |
| Plugin directory | `.claude/skills/` on feature branch |

### 3b. Proposed Skill Type: Feature Skill (Branch-Based)

Based on CONTRIBUTING.md guidelines[^25], this should be a **feature skill** because:
- It adds significant new behavior
- It needs code changes (container skill for agent-side loop logic, possibly host-side scheduler integration)
- It ships as a `skill/auto-research` branch

**Skill structure:**

```
.claude/skills/auto-research/
├── SKILL.md                    # Installation + usage instructions
└── (references on skill branch)

# On skill/auto-research branch, additional files:
container/skills/auto-research/
├── SKILL.md                    # Agent-side loop protocol
└── references/
    ├── experiment-loop.md      # Full loop protocol
    ├── results-format.md       # TSV format spec
    └── safety-rules.md         # Circuit breaker, timeout rules

scripts/
└── auto-research-setup.sh      # One-time setup helper
```

### 3c. Proposed Flow

```
User (via WhatsApp/Telegram/claw):
  "Start an auto-research run on train.py to minimize val_bpb"

NanoPilot orchestrator:
  1. Parse: target=train.py, metric=val_bpb, direction=lower
  2. Create branch: autoresearch/<date>
  3. Establish baseline: run experiment, record val_bpb
  4. Schedule recurring task (interval mode, every ~6 min)
  5. Send user: "🔬 Auto-research started. Baseline val_bpb=0.998. I'll run experiments every ~6 min and report."

Each scheduled iteration (runs in container):
  1. Read scratchpad (groups/{folder}/auto-research-state.json)
  2. Read results history
  3. Ideate next experiment
  4. Modify target file
  5. git commit on experiment branch
  6. Run verify command
  7. Extract metric
  8. Keep or discard (git reset if worse)
  9. Log to results.tsv
  10. Update scratchpad
  11. Send progress via IPC: "Experiment #7: tried wider MLP → val_bpb 0.991 (KEEP ✅)"

User can interact:
  "What's the status?" → reads results.tsv, reports summary
  "Stop auto-research" → cancels scheduled task
  "Try focusing on optimizer changes" → updates scratchpad guidance
```

### 3d. Key Components

#### Component 1: Host-Side Skill (SKILL.md)

The operational SKILL.md that guides setup when user says `/auto-research`:

```yaml
---
name: auto-research
description: >
  Autonomous experiment loop inspired by Karpathy's autoresearch.
  Iteratively modifies code, evaluates against a metric, keeps
  improvements, discards regressions. Runs overnight via scheduled tasks.
  Use when asked to "auto-research", "optimize overnight", "run experiments
  autonomously", or "hill-climb on [metric]".
---
```

**Setup flow:**
1. Ask user for: target file, metric name, verify command, direction (higher/lower)
2. Validate verify command works
3. Create experiment branch
4. Run baseline experiment
5. Schedule recurring task with `schedule_task` MCP tool
6. Confirm to user with baseline results

#### Component 2: Container Skill (Agent-Side Protocol)

A container skill at `container/skills/auto-research/SKILL.md` that the agent loads inside the container. This contains the full loop protocol:

```yaml
---
name: auto-research
description: >
  Autonomous experiment protocol. When this skill is active, follow
  the experiment loop: read state, ideate, modify ONE file, commit,
  run verify command, evaluate metric, keep/discard, log, report.
allowed-tools: Bash(*)
---
```

**Protocol sections:**
- State management (read/write scratchpad JSON)
- Ideation strategy (fix crashes > exploit wins > explore > simplify > radical)
- Single-change discipline
- Metric extraction and comparison
- Keep/discard git operations
- Results logging (TSV format)
- Progress reporting (via `send_message` MCP tool)
- Safety: timeout, max consecutive failures, never modify evaluation file

#### Component 3: State File (Per-Group)

```json
{
  "status": "running",
  "branch": "autoresearch/apr5",
  "target_file": "train.py",
  "read_only_files": ["prepare.py", "evaluate.py"],
  "metric_name": "val_bpb",
  "metric_direction": "lower",
  "verify_command": "uv run train.py > run.log 2>&1 && grep '^val_bpb:' run.log | awk '{print $2}'",
  "baseline_value": 0.998,
  "best_value": 0.991,
  "total_experiments": 12,
  "kept": 7,
  "discarded": 4,
  "crashed": 1,
  "consecutive_failures": 0,
  "max_consecutive_failures": 5,
  "last_experiment_description": "wider MLP hidden dim",
  "guidance": "Focus on optimizer changes next",
  "started_at": "2026-04-05T12:00:00Z"
}
```

#### Component 4: Results TSV (Per-Run)

Same format as Karpathy's, stored at `groups/{folder}/auto-research-results.tsv`:

```
experiment	commit	metric_value	memory_info	status	description
1	a1b2c3d	0.998000	44.0	keep	baseline
2	b2c3d4e	0.993200	44.2	keep	increase LR to 0.04
3	c3d4e5f	1.005000	44.0	discard	switch to GeLU activation
```

#### Component 5: Scheduled Task Integration

Uses NanoPilot's existing `schedule_task` MCP tool[^26]:

```typescript
schedule_task({
  prompt: `You are running auto-research experiment iteration.
    Read /workspace/group/auto-research-state.json for current state.
    Read /workspace/group/auto-research-results.tsv for history.
    Follow the auto-research experiment protocol.
    Target: train.py | Metric: val_bpb | Direction: lower
    After the experiment, update state and results files.
    Report the outcome via send_message.`,
  schedule_type: 'interval',
  schedule_value: '360000',  // 6 minutes (5 min experiment + 1 min overhead)
  context_mode: 'isolated'   // Fresh context each iteration (like run-loop.sh)
})
```

**Why `isolated` context mode**: Each iteration gets a fresh context, preventing context exhaustion over 100+ experiments. State persists via files (scratchpad, results.tsv, git history) — not conversation[^27].

### 3e. User Interaction Commands

Via any channel (WhatsApp, Telegram, Slack, or claw CLI):

| Command | Action |
|---------|--------|
| "Start auto-research on train.py to minimize val_bpb" | Setup + baseline + schedule |
| "Auto-research status" | Read state file, report summary |
| "Stop auto-research" | Cancel scheduled task, report final results |
| "Auto-research: focus on architecture changes" | Update `guidance` field in state |
| "Show auto-research results" | Format and send results.tsv |
| "Revert auto-research" | `git checkout main`, delete branch |

### 3f. Safety & Guardrails

| Guardrail | Implementation |
|-----------|---------------|
| **Branch isolation** | All work on `autoresearch/<tag>` branch, main untouched |
| **Read-only protection** | State file lists `read_only_files` — agent instructed never to modify |
| **Circuit breaker** | After N consecutive failures (default 5), pause and notify user |
| **Timeout** | Each iteration killed after `verify_timeout` (default 10 min) |
| **Container isolation** | Runs inside NanoPilot's Docker/Apple Container — can't escape |
| **Cost awareness** | Log estimated token cost per iteration in state file |
| **Metric gaming prevention** | Evaluation code in read-only file; verify command fixed at setup |

---

## 4. What Makes This Different from Existing Adaptations

| Feature | Karpathy Original | gyoz-ai (Claude Code) | brycealindberg (Claude Code) | **NanoPilot Skill** |
|---------|-------------------|----------------------|------------------------------|---------------------|
| Runtime | Local CLI | Claude Code session | Claude Code + bash launcher | **Containerized agent** |
| Context reset | Manual (new session) | Within session | `run-loop.sh` spawns fresh CLI | **Isolated scheduled tasks** |
| Communication | Console output | Console output | Console + files | **Any channel (WhatsApp, Telegram, Slack, claw)** |
| Monitoring | Check results.tsv manually | Final report | JSONL logs + scratchpad | **Real-time messages to your phone** |
| Steering | Edit program.md | Restart with changes | Edit scratchpad manually | **Chat command: "focus on X"** |
| Stopping | Ctrl+C | Interrupt | Delete state file / max iterations | **"Stop auto-research" in chat** |
| Security | None (local) | Claude Code sandbox | Claude Code sandbox | **Container isolation + IPC auth** |
| Scheduling | Manual restart | Stop hook (same session) | `run-loop.sh` (cron-like) | **Native task scheduler (cron/interval)** |
| Multi-domain | ML training only | Skill improvement only | Any metric | **Any metric** |

**NanoPilot's unique advantages:**
1. **Phone-based monitoring**: Get experiment results pushed to WhatsApp/Telegram while you sleep
2. **Chat-based steering**: Adjust research direction mid-run without touching files
3. **Container isolation**: Each experiment runs sandboxed — can't corrupt host
4. **Native scheduling**: Built-in task scheduler, no bash wrapper needed
5. **Multi-channel**: Start from claw CLI, monitor from phone, steer from Telegram group

---

## 5. Assets Gathered (Do Not Implement — Reference Only)

### Source Code Assets

| Asset | Location | Purpose |
|-------|----------|---------|
| Karpathy's `program.md` | [karpathy/autoresearch/program.md](https://github.com/karpathy/autoresearch/blob/master/program.md) | The original agent instruction file — "research org code" |
| Karpathy's `train.py` | [karpathy/autoresearch/train.py](https://github.com/karpathy/autoresearch/blob/master/train.py) | Example of the "mutable target file" pattern |
| Karpathy's `prepare.py` | [karpathy/autoresearch/prepare.py](https://github.com/karpathy/autoresearch/blob/master/prepare.py) | Example of the "read-only evaluation harness" pattern |
| gyoz-ai SKILL.md | [gyoz-ai/auto-research/skills/auto-research/SKILL.md](https://github.com/gyoz-ai/auto-research/blob/main/skills/auto-research/SKILL.md) | Complete 5-phase skill with parallel agents + keep/discard loop |
| brycealindberg SKILL.md | [brycealindberg/auto-research-loop/skills/auto-research-loop/SKILL.md](https://github.com/brycealindberg/auto-research-loop/blob/main/skills/auto-research-loop/SKILL.md) | Generalized loop engine with metric + task modes |
| brycealindberg `run-loop.sh` | [brycealindberg/auto-research-loop/scripts/run-loop.sh](https://github.com/brycealindberg/auto-research-loop/tree/main/scripts) | Fresh-context-per-iteration bash launcher |
| brycealindberg hooks | [brycealindberg/auto-research-loop/hooks/](https://github.com/brycealindberg/auto-research-loop/tree/main/hooks) | Stop hook for same-session looping |

### NanoPilot Integration Points

| File | Relevance |
|------|-----------|
| `src/task-scheduler.ts` | Schedule recurring experiment iterations |
| `src/ipc.ts` (lines 30-150) | How container output reaches channels |
| `src/container-runner.ts` (lines 34-51) | ContainerInput/Output interfaces for experiment runs |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | MCP tools: `send_message`, `schedule_task`, `cancel_task` |
| `src/types.ts` (lines 35-74) | `ScheduledTask` interface for recurring experiments |
| `.claude/skills/add-parallel/SKILL.md` | Precedent for skill that uses scheduled tasks |
| `.claude/skills/claw/scripts/claw` | Example of utility skill with scripts |
| `CONTRIBUTING.md` | Skill taxonomy and submission guidelines |

### Design Pattern Assets

| Pattern | Source | Adaptation for NanoPilot |
|---------|--------|--------------------------|
| Fixed time budget | Karpathy `TIME_BUDGET = 300` | `verify_timeout` in state file |
| Single-file modification | Karpathy `train.py` only | `target_file` in state config |
| Read-only evaluation | Karpathy `prepare.py` | `read_only_files` array in state |
| Results TSV format | Karpathy `results.tsv` | Same format, stored per-group |
| Simplicity criterion | Karpathy `program.md` | Embedded in container skill protocol |
| Branch-per-run | Karpathy `autoresearch/<tag>` | Same convention |
| Fresh context per iteration | brycealindberg `run-loop.sh` | NanoPilot `context_mode: 'isolated'` |
| Scratchpad persistence | brycealindberg scratchpad.md | `auto-research-state.json` in group folder |
| Circuit breaker | brycealindberg max-failures | `max_consecutive_failures` in state |
| Parallel research agents | gyoz-ai 5-agent phase | Could be Phase 0 "research" before loop starts |
| Quality scoring rubric | gyoz-ai 7 dimensions | Applicable when target is a SKILL.md or docs |

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|------------|-------|
| Karpathy autoresearch architecture and code | **High** | Direct source code audit of all files[^1][^3][^4] |
| Community adaptation architectures | **High** | Full README + SKILL.md audit of both repos[^15][^20] |
| NanoPilot skill taxonomy and integration points | **High** | Direct codebase exploration[^25][^26] |
| Proposed NanoPilot skill design | **Medium-High** | Based on verified integration points; untested |
| Feasibility of scheduled-task-based loop | **High** | `add-parallel` skill already uses this exact pattern[^27] |
| Container isolation for safe experimentation | **High** | Core NanoPilot architecture[^28] |

**Key uncertainty**: Whether NanoPilot's `isolated` context mode + `schedule_task` interval provides sufficient state continuity for coherent multi-iteration research. The scratchpad file pattern (used by brycealindberg) mitigates this, but the agent must be well-prompted to read state before each iteration.

---

## Footnotes

[^1]: [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — README.md (commit `228791f`)
[^2]: GitHub search for "karpathy autoresearch" — 30+ derivative repositories found
[^3]: `karpathy/autoresearch` root directory listing — 10 files total
[^4]: `karpathy/autoresearch/program.md` — "The experiment loop" section, lines 48-67
[^5]: `karpathy/autoresearch/prepare.py` line 31: `TIME_BUDGET = 300`
[^6]: `karpathy/autoresearch/prepare.py` lines 254-270: `evaluate_bpb()` function
[^7]: `karpathy/autoresearch/program.md` line 13: "Modify `train.py` — this is the only file you edit"
[^8]: `karpathy/autoresearch/program.md` lines 83-86: "NEVER STOP" instruction
[^9]: `karpathy/autoresearch/program.md` lines 30-32: Simplicity criterion
[^10]: `karpathy/autoresearch/prepare.py` lines 254-270: Full `evaluate_bpb()` implementation
[^11]: `karpathy/autoresearch/prepare.py` lines 29-31: Constants block
[^12]: `karpathy/autoresearch/program.md` lines 41-55: TSV format specification
[^13]: `karpathy/autoresearch/.gitignore` line 18: `results.tsv`; commit `068d93d` clarifies "should not be committed"
[^14]: `karpathy/autoresearch/program.md` line 48: "dedicated branch (e.g. `autoresearch/mar5`)"
[^15]: [gyoz-ai/auto-research](https://github.com/gyoz-ai/auto-research) README.md
[^16]: `gyoz-ai/auto-research/skills/auto-research/SKILL.md` — Phase 1-5 structure
[^17]: `gyoz-ai/auto-research/skills/auto-research/SKILL.md` — "Phase 2: Parallel Research" section
[^18]: `gyoz-ai/auto-research/skills/auto-research/SKILL.md` — "Agent 2: Skill Structure & Quality Auditor" prompt template
[^19]: `gyoz-ai/auto-research/skills/auto-research/SKILL.md` — "Step 3: Evaluate" section
[^20]: [brycealindberg/auto-research-loop](https://github.com/brycealindberg/auto-research-loop) README.md
[^21]: `brycealindberg/auto-research-loop/README.md` — "Two modes" table
[^22]: `brycealindberg/auto-research-loop/README.md` — "Infrastructure Created" table
[^23]: `brycealindberg/auto-research-loop/README.md` — "Safety" section
[^24]: `brycealindberg/auto-research-loop/skills/auto-research-loop/SKILL.md` — "Domain Adaptation" table
[^25]: `/Users/mattheww/git/nanopilot/CONTRIBUTING.md` — Skill taxonomy (4 types)
[^26]: NanoPilot `container/agent-runner/src/ipc-mcp-stdio.ts` — `schedule_task` MCP tool
[^27]: NanoPilot `.claude/skills/add-parallel/SKILL.md` — Precedent for interval-based scheduled tasks with `context_mode: 'isolated'`
[^28]: NanoPilot `src/container-runner.ts` lines 34-51 — ContainerInput interface, container isolation

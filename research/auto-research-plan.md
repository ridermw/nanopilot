# Plan: Auto-Research Skill for NanoPilot (v1)

## Problem

We want a NanoPilot skill that implements Karpathy's autoresearch pattern — autonomous,
iterative experimentation where an AI agent modifies code, evaluates against a metric,
and keeps or discards changes in a loop. Must work via any NanoPilot channel (WhatsApp,
Telegram, Slack, claw CLI) and leverage NanoPilot's container isolation + task scheduler.

## Design Principles (from research)

Heavily borrowing from two community adaptations:

**From gyoz-ai/auto-research:**
- Parallel research agents for initial discovery (stretch goal, v2)
- 7-dimension quality scoring rubric
- Priority scoring: `Impact × Confidence / Complexity`
- Phased approach: Discovery → Research → Synthesis → Improve Loop → Report

**From brycealindberg/auto-research-loop:**
- Two modes: metric (hill-climbing) + task (accumulate) — **v1 = metric mode only**
- Fresh context per iteration (maps to NanoPilot's `context_mode: 'isolated'`)
- Scratchpad persistence for cross-iteration memory
- Circuit breaker on consecutive failures
- Read-only file protection
- Results TSV experiment journal

**From Karpathy's original:**
- Single-file modification scope
- Fixed time budget per experiment
- Simplicity criterion (complex additions with marginal value → discard)
- Branch-per-run (`autoresearch/<tag>`)
- NEVER STOP — loop until interrupted

## v1 Scope

Keeping v1 tight:
- **Metric mode only** (hill-climbing with keep/discard)
- Single target repo, single target file, single verify command
- Minimal commands: `start`, `status`, `stop`, `focus`
- One JSON state file, one append-only results log
- Deferred to v2: task mode, parallel discovery phase, rich scoring, revert/results management

## Critical Design Fix: Target Repo Mount

**Problem identified by critique:** `/workspace/project` is NanoPilot itself, mounted
**read-only** for the main group. Non-main groups don't get it at all. The agent cannot
modify and commit to files there.

**Solution:** The target repo must be mounted as a writable **additional mount** under
`/workspace/extra/<mount-name>`. The setup wizard:
1. Asks user for the host-side repo path (e.g., `/Users/me/projects/my-ml-project`)
2. Creates a **dedicated worktree** or clone for the experiment (never the user's active checkout)
3. Attaches it via `containerConfig.additionalMounts` on the group
4. All git operations run against `/workspace/extra/<mount-name>`

This uses NanoPilot's existing extra-mount infrastructure and avoids touching the user's
working tree.

## State Ownership Split

Clear contract to prevent clobbers between host and container:

**Host-owned fields** (written by setup wizard and management commands):
- `config`: target_file, repo_path, mount_name, metric_name, direction, verify_cmd
- `control`: guidance, paused, max_iterations, max_no_improvement

**Container-owned fields** (written by each iteration):
- `runtime`: experiment_count, kept, discarded, crashed, baseline, best_value, head_commit
- `scratchpad`: bounded summary of insights + what_to_try_next (max ~500 words)
- `safety`: consecutive_failures, circuit_breaker_triggered

**Both write atomically:** temp file + rename to prevent partial/corrupt reads.

## Architecture

```
User: "Start auto-research on train.py, minimize val_bpb"
  │
  ▼
┌─────────────────────────────────────────────────┐
│ Host-Side Skill (setup wizard)                   │
│  1. Collect: repo path, target file, metric,     │
│     verify command, direction (min/max)          │
│  2. Create worktree: autoresearch/<date>         │
│  3. Attach as writable extra mount               │
│  4. Run baseline (first container)               │
│  5. Write state file to group folder             │
│  6. schedule_task(interval, isolated)            │
│  7. Report baseline to user via channel          │
└─────────────────────────┬───────────────────────┘
                          │ (every N minutes)
                          ▼
┌─────────────────────────────────────────────────┐
│ Container Skill (one iteration per container)    │
│  1. Read state + results from /workspace/group   │
│  2. cd /workspace/extra/<mount> (writable repo)  │
│  3. Preflight: clean tree, correct branch        │
│  4. Ideate next experiment (from scratchpad)      │
│  5. Modify target file (ONE change)              │
│  6. git commit -m "exp N: description"           │
│  7. Run verify command (with timeout)            │
│  8. Extract metric → KEEP or git reset --hard    │
│  9. Append to results.tsv (in group folder)      │
│  10. Update state: runtime + scratchpad          │
│  11. send_message only on improvement/failure    │
│  12. Check circuit breaker → pause_task if hit   │
└─────────────────────────────────────────────────┘

User interactions (any channel):
  "auto-research status"    → reads state, reports summary
  "stop auto-research"      → cancel_task
  "focus on optimizer next"  → updates control.guidance in state
```

## Safety Design

Beyond circuit breaker (from critique):
- **Dedicated worktree**: never touch user's active checkout
- **Branch isolation**: all work on `autoresearch/<tag>`, main untouched
- **Clean-tree preflight**: abort iteration if working tree is dirty
- **Exact allowed path**: only modify `config.target_file`, nothing else
- **Read-only list**: explicitly protected files
- **Max iterations cap**: hard stop after N total experiments
- **Max no-improvement cap**: pause after M consecutive non-improvements
- **Diff size limit**: reject changes that are too large (complexity filter)
- **Verify command timeout**: kill if exceeds budget
- **Anti-spam**: only send_message on improvement, failure, or circuit breaker — not every iteration
- **Git identity**: set `user.name`/`user.email` explicitly in container
- **Atomic state writes**: temp file + rename

## Todos

### Phase 1: Formats (no dependencies, parallelizable)
- **state-format** — Define `auto-research-state.json` schema
  - Host-owned: config (repo_path, mount_name, target_file, read_only_files, metric_name,
    direction, verify_cmd, branch, base_commit) + control (guidance, max_iterations, max_no_improvement)
  - Container-owned: runtime (experiment_count, kept, discarded, crashed, baseline_value,
    best_value, head_commit) + scratchpad (bounded ~500 word summary) + safety (consecutive_failures,
    max_consecutive_failures, circuit_breaker_triggered)
  - Include version + updated_at + last_writer for conflict detection
  - Atomic write protocol: write to .tmp, rename

- **results-format** — Define results log format (JSONL in group folder)
  - Fields: experiment_num, commit_sha, metric_value, status (kept/discarded/crashed),
    description, timestamp, diff_size
  - Append-only, never edited

### Phase 2: Core Skills (depend on formats, parallelizable)
- **host-skill** — Create `.claude/skills/auto-research/SKILL.md`
  - Setup wizard: collect repo path + target file + metric + verify cmd + direction
  - Worktree creation, extra mount attachment, baseline run
  - Schedule recurring task with `context_mode: 'isolated'`
  - Management commands: status (read state), stop (cancel_task), focus (update control.guidance)
  - Git identity setup in container via `script` field

- **container-skill** — Create `container/skills/auto-research/SKILL.md`
  - Full iteration protocol (12 steps from architecture diagram)
  - Metric mode: keep on improvement, `git reset --hard HEAD~1` on regression
  - Ideation priority: fix crashes > exploit wins > explore > simplify > radical
  - Karpathy's simplicity criterion
  - Preflight checks: clean tree, correct branch, state version
  - Anti-spam: only report meaningful updates
  - Circuit breaker: pause_task after N consecutive failures

### Phase 3: Reference Docs (depend on formats, parallelizable)
- **experiment-protocol** — `references/experiment-loop.md`
  - Detailed 12-step loop with decision trees
  - Git operations: keep, discard, crash recovery
  - Scratchpad update rules (bounded, what to remember)
  - Ideation strategy guide

- **safety-rules** — `references/safety-rules.md`
  - All safety mechanisms documented
  - Circuit breaker logic, max caps, diff limits
  - Worktree isolation rationale
  - What to do when circuit breaker fires

### Phase 4: Ship (depends on all above)
- **create-branch** — Create `research/auto-research` branch with all assets
- **push-and-pr** — Push and create PR
- **cleanup** — Delete local branch

## Key Design Decisions

### Metric Mode Only (v1)
Hill-climbing: `--metric val_bpb --verify "python eval.py" --direction minimize`
Discard on regression (`git reset --hard HEAD~1`). Keep on improvement.
Task mode deferred to v2 — it's architecturally different (never reverts, needs
completion detection).

### Fresh Context Per Iteration (from brycealindberg)
`context_mode: 'isolated'` gives each iteration a clean context window. State persists
via files (JSON state, JSONL results, git history) not conversation — identical to
brycealindberg's `run-loop.sh`. Prevents context exhaustion over long runs.

### Writable Extra Mount (from critique)
Target repo mounted at `/workspace/extra/<name>` as writable. Dedicated worktree
so we never touch the user's active checkout. This uses existing NanoPilot infrastructure.

### Chat-Based Monitoring (NanoPilot differentiator)
Unlike CLI-only tools, NanoPilot sends results to user's phone/chat.
Monitor auto-research from bed via WhatsApp. Anti-spam: only report on
improvement, failure streaks, or circuit breaker — not every iteration.

### Chat-Based Steering (NanoPilot-native)
"Focus on architecture changes" mid-run → updates `control.guidance` in state →
next isolated iteration picks it up from scratchpad.

### Deferred to v2
- Task mode (accumulate commits, no revert, completion detection)
- Parallel discovery phase (5 research agents from gyoz-ai)
- Multi-file modification scope
- Rich scoring rubric (7 dimensions from gyoz-ai)
- Results visualization / revert commands

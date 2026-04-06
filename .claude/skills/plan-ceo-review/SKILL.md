---
name: plan-ceo-review
description: Rigorously review a plan, challenge its premises, and decide whether to expand, hold, or reduce scope before implementation. Use when the user asks for CEO review, wants a plan challenged, or wants to think bigger or narrower before coding.
---

# CEO Plan Review

NanoPilot adaptation of the canonical gstack OpenClaw skill.

- Canonical repo: `https://github.com/garrytan/gstack`
- Canonical source path: `openclaw/skills/gstack-openclaw-ceo-review/SKILL.md`
- Reviewed ref: `422f172fbbcb75774c86bbe5d7c097adaf561380` (`v0.15.10.0`)

This is a **plan review** skill.

**Do NOT make any code changes.**
**Do NOT start implementation.**

## What is different from canonical gstack

This is a NanoPilot adaptation, not a raw copy.

- Use the session `plan.md` and session SQL state instead of `memory/`
- Use `AskUserQuestion` for explicit approval and scope decisions
- Keep output compatible with NanoPilot CLI and branch-based workflow
- Strip gstack-specific branding while keeping the review rigor

## When to use this

Use this skill when the user:

- asks for a CEO review
- wants a plan challenged or pressure-tested
- wants to think bigger, narrower, or more rigorously
- has a draft design and wants a pre-implementation review

If no plan exists yet, ask the user to provide one or run `/office-hours` first.

## Operating rules

1. **No silent scope changes.** Every expansion or reduction must be explicit.
2. **One issue at a time** when you need a user decision.
3. **Every deferred item gets written down.**
4. **Observability, edge cases, and failure modes are in scope.**
5. **Do not review vaguely.** Name the actual challenge and why it matters.

## Step 1: Read the plan and context

1. Read `CONSTITUTION.md` first if present.
2. Read the current session `plan.md` if available.
3. Read the most relevant code and docs.
4. Identify what already exists that the plan can reuse.

If there is no plan artifact and the user has not supplied one, stop and ask
them to provide a plan or use `/office-hours` first.

## Step 2: Premise challenge

Before mode selection, challenge the plan at the root:

1. Is this the right problem?
2. Is the plan solving the direct outcome or a proxy?
3. What happens if we do nothing?
4. What existing code or workflow already solves part of this?
5. What is the 12-month ideal end state?

Write a short premise summary before moving on.

## Step 3: Produce alternatives when the shape is still open

If the plan still has structural ambiguity, produce **2-3 approaches** before
locking review mode.

For each approach, include:

- Name
- Summary
- Effort: S / M / L / XL
- Risk: Low / Med / High
- Pros
- Cons
- Reuses

Rules:

- One approach must be **minimal viable**
- One approach must be **ideal architecture**

Then recommend one.

## Step 4: Choose review mode explicitly

Present these modes and ask the user to choose one with `AskUserQuestion`:

1. **Scope expansion** - dream bigger, surface ambitious additions
2. **Selective expansion** - keep baseline scope, but offer cherry-picked expansions
3. **Hold scope** - maximum rigor without changing scope
4. **Scope reduction** - cut to the minimum coherent version

Suggested defaults:

- Greenfield feature -> selective expansion
- Feature enhancement -> selective expansion
- Bug fix / hotfix -> hold scope
- Plan touching more than ~15 files or multiple systems -> scope reduction

Do not proceed without an explicit mode choice.

## Step 5: Review every section

Evaluate every section below. If a section has no issues, say so explicitly.

### 1. Architecture

- boundaries
- coupling
- data flow
- state ownership
- rollback posture

### 2. Error and rescue map

- named error cases
- what triggers them
- who catches them
- what the user sees

### 3. Security and threat model

- secrets
- authorization
- unsafe inputs
- dependency risk
- auditability

### 4. Data flow and edge cases

- nil / empty / wrong type
- stale state
- slow network
- partial failure
- retry behavior

### 5. Code quality

- naming
- duplication
- over-engineering
- under-engineering
- blast radius

### 6. Tests

- happy path
- error paths
- regressions
- integration coverage
- missing acceptance tests

### 7. Observability

- logs
- metrics
- alerts
- runbooks
- how to know production is broken

### 8. Data and state management

- tables
- indexes
- migrations
- integrity constraints
- lifecycle of new state

### 9. API / contract design

- request shape
- response shape
- compatibility
- rate limiting / retries
- contract clarity

### 10. Performance and scalability

- what breaks at 10x
- what breaks at 100x
- hotspots
- background work

### 11. UX / design

Only if the plan touches UI:

- hierarchy
- empty/loading/error states
- accessibility
- consistency

## Step 6: Ask about important issues one at a time

If the review finds decisions the user must make, ask them one at a time with
`AskUserQuestion`.

Do not dump a dozen open questions in one message.

## Step 7: Update the plan artifact

Update the session `plan.md` if available.

Do **not** create markdown files in the repository.

Add a section like:

## CEO REVIEW SUMMARY

- Mode
- Strongest challenges
- Recommended path
- Accepted scope
- Deferred
- Not in scope
- Open decisions

If there is no session plan file, present the summary in chat only.

## Step 8: Close with a decision gate

Summarize the review briefly, then ask:

`AskUserQuestion: What should happen next?`

Choices:

- Accept review and keep current plan
- Revise the plan
- Reduce scope
- Expand scope
- Stop here

If the user accepts the review, stop. Do not implement code from this skill.
Implementation must be a separate explicit step.

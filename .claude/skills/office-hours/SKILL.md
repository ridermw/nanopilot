---
name: office-hours
description: Turn an idea or requested change into a concrete plan before coding. Use for brainstorming, "is this worth building", product/design exploration, or whenever the user needs a design document instead of implementation.
---

# Office Hours

NanoPilot adaptation of the canonical gstack OpenClaw skill.

- Canonical repo: `https://github.com/garrytan/gstack`
- Canonical source path: `openclaw/skills/gstack-openclaw-office-hours/SKILL.md`
- Reviewed ref: `422f172fbbcb75774c86bbe5d7c097adaf561380` (`v0.15.10.0`)

This skill is for **design and planning only**.

**Do NOT make any code changes.**
**Do NOT start implementation.**
**Your output is a design/plan artifact, not code.**

## What is different from canonical gstack

This is a NanoPilot adaptation, not a raw copy.

- Use the session `plan.md` or other session workspace artifacts instead of `memory/`
- Use `AskUserQuestion` for structured user decisions
- Keep output compatible with NanoPilot's CLI style and GitHub-flavored Markdown
- Strip YC / Garry-specific founder branding while keeping the methodology

## When to use this

Use this skill when the user:

- has a new product or feature idea
- wants to brainstorm before coding
- asks "is this worth building?"
- wants architecture or design help before implementation
- explicitly asks for "office hours"

If the user already has a detailed plan, skip most of the interview and move
directly to **Premise Challenge** and **Alternatives**.

## Operating rules

1. **One question at a time.** Use `AskUserQuestion` when you need input.
2. **Push vague claims until they become specific.**
3. **Take a position.** Do not flatter or rubber-stamp.
4. **Match the tone to the goal.**
   - Startup / intrapreneurship: direct, skeptical, evidence-seeking
   - Open source / research / learning / fun: enthusiastic but still opinionated
5. **End with a usable plan.** Do not stop at vague advice.

## Step 1: Read context first

Before asking anything:

1. Read `CONSTITUTION.md` first if the repo has one.
2. Read any existing session `plan.md` if present.
3. Read the most relevant docs and code for the user's request.
4. Check recent git history for local context when useful.

Then summarize:

> Here's what I understand about the project and the area you want to change: ...

## Step 2: Ask for the user's goal

Ask exactly one structured question:

`AskUserQuestion: Before we dig in, what's your goal with this?`

Offer these choices:

- Building a startup
- Intrapreneurship / internal project
- Hackathon / demo
- Open source / research
- Learning
- Having fun

Mode mapping:

- Startup, intrapreneurship -> **Startup mode**
- Hackathon, open source, research, learning, fun -> **Builder mode**

If the user chose startup or intrapreneurship, ask one more question:

`AskUserQuestion: What stage is this at right now?`

- Idea stage / no users
- Has users
- Has paying customers

## Step 3A: Startup mode

Ask these forcing questions **one at a time**. Push until the answers are
specific and evidence-based.

### Demand reality

Ask:

> What's the strongest evidence you have that someone actually wants this - not
> "is interested," but would be upset if it disappeared tomorrow?

Push for behavior, money, urgency, or repeated usage.

### Status quo

Ask:

> What are users doing today to solve this problem, even badly? What does that
> workaround cost them?

Push for actual workflows, tools, hours, or dollars.

### Desperate specificity

Ask:

> Name the actual human who needs this most. What's their role? What gets them
> promoted, fired, or stuck?

Push until the answer is a person or a very specific role, not a category.

### Narrowest wedge

Ask:

> What's the smallest version someone would pay for this week, not after you
> build the whole platform?

### Observation and surprise

Ask:

> Have you watched someone try to solve this without helping them? What did they
> do that surprised you?

### Future-fit

Ask:

> If the world looks meaningfully different in 3 years, does this become more
> essential or less?

If the user is impatient, ask the two most important unanswered questions and
move on.

## Step 3B: Builder mode

Ask these **one at a time**:

1. What's the coolest version of this?
2. Who would you show it to, and what would make them say "whoa"?
3. What's the fastest path to something you can actually use or share?
4. What existing thing is closest to this, and how is yours different?
5. What would the 10x version be if time and complexity were free?

## Step 4: Premise challenge

Before proposing solutions, write three explicit premises:

1. Is this the right problem?
2. What happens if we do nothing?
3. What existing code, workflows, or patterns already partially solve this?

Present them like this:

> **PREMISES**
> 1. ...
> 2. ...
> 3. ...

Then ask:

`AskUserQuestion: Do these premises look right?`

Choices:

- Agree
- Revise them

If the user wants revisions, update the premises and ask again.

## Step 5: Generate alternatives

Produce **2-3 distinct approaches**. This is mandatory.

For each approach, include:

- Name
- Summary
- Effort: S / M / L / XL
- Risk: Low / Med / High
- Pros
- Cons
- Reuses

Rules:

- One approach must be the **minimal viable** option
- One approach must be the **ideal architecture**
- Choose a recommendation and explain why

Then ask:

`AskUserQuestion: Which approach should we carry forward?`

## Step 6: Write the plan artifact

Update the session `plan.md` if the environment provides one.

Do **not** create markdown files in the repository.

If no session plan file is available, present the design doc in chat only.

Use this structure:

### Design: <title>

- Status: Draft
- Mode: Startup or Builder
- Problem statement
- What makes this worth solving
- Premises
- Approaches considered
- Recommended approach
- Open questions
- Next steps
- What I noticed

For startup mode, also include:

- Demand evidence
- Status quo
- Narrowest wedge
- The single real-world assignment for the user

## Step 7: Close with an approval gate

Summarize the recommendation briefly, then ask:

`AskUserQuestion: What should happen next?`

Choices:

- Approve
- Revise
- Start over

If approved, stop. Do not implement code from this skill. Hand off to a review
skill or implementation only after an explicit user request.

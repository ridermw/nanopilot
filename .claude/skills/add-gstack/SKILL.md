---
name: add-gstack
description: Add the reviewed gstack/OpenClaw mapping layer to NanoPilot. Uses garrytan/gstack as the canonical reference, but merges only NanoPilot's skill/gstack adaptation branch into your fork.
---

# Add Gstack Mapping Layer

This skill installs NanoPilot's **reviewed** gstack mapping layer.

It does **not** merge `garrytan/gstack` directly into a NanoPilot repo. The
canonical gstack repo is the methodology source of truth; the installed artifact
for NanoPilot is the reviewed `upstream/skill/gstack` adaptation branch.

## Canonical source reviewed for this skill

- Repo: https://github.com/garrytan/gstack
- Reviewed ref: `422f172fbbcb75774c86bbe5d7c097adaf561380` (`v0.15.10.0`)
- Source lock: `.claude/skills/add-gstack/source-lock.json`
- Mapping matrix: `.claude/skills/add-gstack/mapping.json`

## What this branch adds today

- Reviewed source pin for the OpenClaw-native gstack skills
- Explicit OpenClaw -> NanoPilot mapping matrix
- NanoPilot-adapted `/office-hours` and `/plan-ceo-review` skills
- Static validator for the mapping contract
- Drift checker for upstream OpenClaw changes

`/investigate` and `/retro` remain deferred until the first adapted planning
skills and the drift process have proven out.

## Phase 1: Pre-flight

### Ensure a clean working tree

```bash
git status --porcelain
```

If the working tree is not clean, stop and ask the user to commit or stash
their changes first.

### Ensure the `upstream` remote exists

```bash
git remote -v
```

If `upstream` is missing, add it:

```bash
git remote add upstream https://github.com/ridermw/nanopilot.git
```

### Check whether `skill/gstack` is already applied

```bash
git fetch upstream skill/gstack
git merge-base --is-ancestor FETCH_HEAD HEAD && echo "already applied" || echo "not applied"
```

If it is already applied, skip to **Phase 3: Validate**.

## Phase 2: Apply the reviewed NanoPilot branch

Merge the reviewed NanoPilot adaptation branch:

```bash
git fetch upstream skill/gstack
git merge upstream/skill/gstack
```

If conflicts occur, resolve them by understanding both sides and preserving the
user's intentional local customizations.

> **Do NOT merge `garrytan/gstack` directly into a NanoPilot repo.**
>
> The canonical gstack repo is for reference and comparison. The thing users
> install into a NanoPilot fork is the reviewed NanoPilot adaptation branch.

## Phase 3: Validate

Run the existing skill validator plus the gstack-specific validator:

```bash
bash scripts/validate-skills.sh
bash scripts/validate-gstack-mapping.sh
```

Then run the repository validation commands:

```bash
npm run build
npm test
```

## Phase 4: Explain what was installed

After merge and validation, summarize:

1. The canonical source and reviewed pin
2. The current watched OpenClaw skills from `source-lock.json`
3. The current NanoPilot mapping statuses from `mapping.json`
4. What is deferred (for example, `investigate` and `retro`)

Make it clear that this is a **reviewed translation layer**, not a promise to
follow upstream gstack live.

## Phase 5: Maintainer drift checks

To compare the reviewed pin with current upstream gstack:

```bash
bash scripts/check-gstack-drift.sh
```

This should be used by maintainers to detect:

- watched OpenClaw skills changed upstream
- new `gstack-openclaw-*` skills were added upstream

If drift is detected, review the upstream diff, update the mapping, rerun the
validators, and only then bump the reviewed source lock.

## Phase 6: User updates later

Once a user has merged `skill/gstack`, they should pick up reviewed future
changes the normal NanoPilot way:

```bash
/update-skills
```

That updates the NanoPilot adaptation branch, not raw upstream gstack.

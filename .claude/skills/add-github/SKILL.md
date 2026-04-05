---
name: add-github
description: Add GitHub CLI skill to container agents. Installs gh CLI in the container and passes GITHUB_TOKEN so agents can manage issues, PRs, and code review.
---

# Add GitHub Skill

This skill gives container agents access to the GitHub CLI (`gh`) for managing issues, pull requests, and code review.

## Phase 1: Pre-flight

### Check if already applied

```bash
grep "githubcli" container/Dockerfile
```

If the output shows `githubcli-archive-keyring`, the code changes are already in place. Skip to Phase 3 (Configure).

## Phase 2: Apply Code Changes

### Merge the skill branch

```bash
git fetch origin skill/github
git merge origin/skill/github
```

This merges three changes:

- `container/Dockerfile` — installs `gh` CLI from GitHub's official apt repo
- `src/container-runner.ts` — passes `GITHUB_TOKEN` and `GH_REPO` from `.env` to containers
- `container/skills/agent-github/SKILL.md` — agent-facing docs for GitHub CLI usage

Resolve any conflicts by reading both sides and preserving intent.

### Rebuild

```bash
./container/build.sh
npm run build
```

Build must be clean before proceeding.

## Phase 3: Configure Token and Repository

### Step 1: Ask for token or guide creation

Use `AskUserQuestion: Do you have a GitHub personal access token, or do you need to create one?`

**If they have one:** collect it now.

**If they need one:**
> 1. Go to https://github.com/settings/tokens?type=beta
> 2. **Generate new token** (fine-grained recommended)
> 3. Scopes needed: `repo` (full control) or fine-grained with Issues + Pull Requests read/write
> 4. Copy the token

### Step 2: Add to .env

```bash
echo "GITHUB_TOKEN=<token>" >> .env
echo "GH_REPO=<owner/repo>" >> .env
```

`GH_REPO` is optional — if set, `gh` commands default to that repo without needing `--repo`.

### Step 3: Restart

```bash
launchctl kickstart -k gui/$(id -u)/com.nanopilot  # macOS
# Linux: systemctl --user restart nanopilot
```

## Phase 4: Verify

Send a test message to your agent:

> List the open issues in my repo

The agent should use `gh issue list` and return results.

### Troubleshooting

If `gh` commands fail with "authentication required":
- Check `GITHUB_TOKEN` is set in `.env`
- Restart the service (token is read at container start)
- Verify the token has the right scopes: `gh auth status` locally

If `gh` commands fail with "repository not found":
- Set `GH_REPO=owner/repo` in `.env`, or
- Tell the agent which repo to use in your message

## Removal

1. Remove `GITHUB_TOKEN` and `GH_REPO` from `.env`
2. Revert the code: `git checkout main -- container/Dockerfile src/container-runner.ts`
3. Remove the container skill: `rm -rf container/skills/agent-github`
4. Rebuild: `./container/build.sh && npm run build`
5. Restart the service

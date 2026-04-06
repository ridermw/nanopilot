#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_LOCK="$ROOT_DIR/.claude/skills/add-gstack/source-lock.json"

node --input-type=module - "$SOURCE_LOCK" <<'NODE'
import fs from 'node:fs';

const [lockPath] = process.argv.slice(2);
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

const { owner, repo, trackBranch, reviewedRef } = lock.canonicalSource;
const watchedSkills = lock.watchedSkills ?? [];

const headers = {
  'User-Agent': 'nanopilot-gstack-drift-check',
  Accept: 'application/vnd.github+json',
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

function encodeGithubPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

const branchCommit = await getJson(
  `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(trackBranch)}`,
);
const skillsDir = await getJson(
  `https://api.github.com/repos/${owner}/${repo}/contents/openclaw/skills?ref=${encodeURIComponent(trackBranch)}`,
);

const currentSkillNames = skillsDir
  .filter((entry) => entry.type === 'dir' && entry.name.startsWith('gstack-openclaw-'))
  .map((entry) => entry.name)
  .sort();
const lockedSkillNames = watchedSkills.map((skill) => skill.name).sort();

const drift = [];

for (const current of currentSkillNames) {
  if (!lockedSkillNames.includes(current)) {
    drift.push(`New upstream OpenClaw skill detected: ${current}`);
  }
}

for (const locked of lockedSkillNames) {
  if (!currentSkillNames.includes(locked)) {
    drift.push(`Watched upstream OpenClaw skill disappeared: ${locked}`);
  }
}

for (const watched of watchedSkills) {
  const fileMeta = await getJson(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGithubPath(
      watched.path,
    )}?ref=${encodeURIComponent(trackBranch)}`,
  );

  if (fileMeta.sha !== watched.blobSha) {
    drift.push(
      `Watched upstream file changed: ${watched.name} (${watched.blobSha} -> ${fileMeta.sha})`,
    );
  }
}

if (drift.length > 0) {
  console.error(
    `Gstack drift detected against reviewed ref ${reviewedRef} while tracking ${trackBranch}:`,
  );
  for (const line of drift) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

if (branchCommit.sha === reviewedRef) {
  console.log(`No gstack drift: upstream ${trackBranch} still matches reviewed ref ${reviewedRef}.`);
} else {
  console.log(
    `No watched-skill drift: upstream ${trackBranch} advanced to ${branchCommit.sha}, but watched OpenClaw skills still match reviewed ref ${reviewedRef}.`,
  );
}
NODE

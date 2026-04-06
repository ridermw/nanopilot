#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_LOCK="$ROOT_DIR/.claude/skills/add-gstack/source-lock.json"
MAPPING_FILE="$ROOT_DIR/.claude/skills/add-gstack/mapping.json"
SKILL_FILE="$ROOT_DIR/.claude/skills/add-gstack/SKILL.md"

node - "$SOURCE_LOCK" "$MAPPING_FILE" "$SKILL_FILE" <<'NODE'
const fs = require('node:fs');

const [sourceLockPath, mappingPath, skillPath] = process.argv.slice(2);
const errors = [];

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${path}: invalid JSON (${error.message})`);
    return null;
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be a non-empty string`);
    return false;
  }

  return true;
}

for (const path of [sourceLockPath, mappingPath, skillPath]) {
  if (!fs.existsSync(path)) {
    errors.push(`Missing required file: ${path}`);
  }
}

const sourceLock = readJson(sourceLockPath);
const mapping = readJson(mappingPath);
const skillText = fs.existsSync(skillPath)
  ? fs.readFileSync(skillPath, 'utf8')
  : '';

if (sourceLock) {
  if (sourceLock.schemaVersion !== 1) {
    errors.push('source-lock.json schemaVersion must equal 1');
  }

  const canonical = sourceLock.canonicalSource ?? {};
  requireString(canonical.owner, 'canonicalSource.owner');
  requireString(canonical.repo, 'canonicalSource.repo');
  requireString(canonical.repoUrl, 'canonicalSource.repoUrl');
  requireString(canonical.trackBranch, 'canonicalSource.trackBranch');
  requireString(canonical.reviewedRef, 'canonicalSource.reviewedRef');
  requireString(canonical.reviewedLabel, 'canonicalSource.reviewedLabel');
  requireString(canonical.reviewedAt, 'canonicalSource.reviewedAt');

  const watchedSkills = sourceLock.watchedSkills;
  if (!Array.isArray(watchedSkills) || watchedSkills.length === 0) {
    errors.push('source-lock.json must declare at least one watched skill');
  } else {
    const seen = new Set();
    for (const skill of watchedSkills) {
      requireString(skill.name, 'watchedSkills[].name');
      requireString(skill.path, 'watchedSkills[].path');
      requireString(skill.blobSha, 'watchedSkills[].blobSha');
      if (skill.name && seen.has(skill.name)) {
        errors.push(`Duplicate watched skill name: ${skill.name}`);
      }
      seen.add(skill.name);
    }
  }

  const requiredSkillSnippets = [
    canonical.repoUrl,
    canonical.reviewedRef,
    'upstream/skill/gstack',
    'Do NOT merge `garrytan/gstack` directly into a NanoPilot repo.',
    'bash scripts/validate-gstack-mapping.sh',
    'bash scripts/check-gstack-drift.sh'
  ];

  for (const snippet of requiredSkillSnippets) {
    if (!skillText.includes(snippet)) {
      errors.push(`add-gstack/SKILL.md is missing required text: ${snippet}`);
    }
  }
}

if (mapping && sourceLock) {
  if (mapping.schemaVersion !== 1) {
    errors.push('mapping.json schemaVersion must equal 1');
  }

  if (mapping.canonicalReviewedRef !== sourceLock.canonicalSource.reviewedRef) {
    errors.push('mapping.json canonicalReviewedRef must match source-lock reviewedRef');
  }

  const watchedByName = new Map(
    (sourceLock.watchedSkills ?? []).map((skill) => [skill.name, skill]),
  );
  const allowedStatuses = new Set([
    'planned-adaptation',
    'adapted',
    'deferred',
    'dropped',
  ]);
  const mappings = mapping.mappings;

  if (!Array.isArray(mappings) || mappings.length === 0) {
    errors.push('mapping.json must declare at least one mapping entry');
  } else {
    const seenMappings = new Set();

    for (const entry of mappings) {
      requireString(entry.upstreamSkill, 'mappings[].upstreamSkill');
      requireString(entry.upstreamPath, 'mappings[].upstreamPath');
      requireString(entry.status, 'mappings[].status');
      requireString(entry.rationale, 'mappings[].rationale');

      if (!allowedStatuses.has(entry.status)) {
        errors.push(
          `Unsupported mapping status for ${entry.upstreamSkill}: ${entry.status}`,
        );
      }

      if (entry.upstreamSkill && seenMappings.has(entry.upstreamSkill)) {
        errors.push(`Duplicate mapping entry: ${entry.upstreamSkill}`);
      }
      seenMappings.add(entry.upstreamSkill);

      const watched = watchedByName.get(entry.upstreamSkill);
      if (!watched) {
        errors.push(`Mapping entry does not correspond to a watched skill: ${entry.upstreamSkill}`);
      } else if (watched.path !== entry.upstreamPath) {
        errors.push(
          `Mapping path mismatch for ${entry.upstreamSkill}: expected ${watched.path}, got ${entry.upstreamPath}`,
        );
      }

      if (entry.status === 'planned-adaptation' || entry.status === 'adapted') {
        const target = entry.nanopilotTarget ?? {};
        requireString(target.name, `nanopilotTarget.name for ${entry.upstreamSkill}`);
        requireString(target.path, `nanopilotTarget.path for ${entry.upstreamSkill}`);
        requireString(target.surface, `nanopilotTarget.surface for ${entry.upstreamSkill}`);

        if (
          !Array.isArray(entry.requiredSubstitutions) ||
          entry.requiredSubstitutions.length === 0
        ) {
          errors.push(
            `${entry.upstreamSkill} must declare requiredSubstitutions for an adaptation status`,
          );
        }
      }
    }

    for (const watched of watchedByName.keys()) {
      if (!mappings.some((entry) => entry.upstreamSkill === watched)) {
        errors.push(`Watched upstream skill is missing from mapping.json: ${watched}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Gstack mapping validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Gstack mapping valid \u2713');
NODE

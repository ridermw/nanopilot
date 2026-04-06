#!/usr/bin/env bash
# Validate SKILL.md files in .claude/skills/
# Checks: file exists, has YAML frontmatter (--- delimited), 500 lines or fewer
set -euo pipefail

SKILLS_DIR=".claude/skills"
ERRORS=0

if [ ! -d "$SKILLS_DIR" ]; then
  echo "No skills directory found at $SKILLS_DIR"
  exit 0
fi

# Find skill directories (handle case where none exist)
skill_dirs=()
for d in "$SKILLS_DIR"/*/; do
  [ -d "$d" ] && skill_dirs+=("$d")
done

if [ ${#skill_dirs[@]} -eq 0 ]; then
  echo "No skill directories found"
  exit 0
fi

for skill_dir in "${skill_dirs[@]}"; do
  skill_file="$skill_dir/SKILL.md"

  if [ ! -f "$skill_file" ]; then
    echo "WARN: No SKILL.md in $skill_dir"
    continue
  fi

  # Check frontmatter: file must start with ---
  first_line=$(head -1 "$skill_file")
  if [ "$first_line" != "---" ]; then
    echo "WARN: $skill_file missing frontmatter (must start with ---)"
    continue
  fi

  # Check closing frontmatter delimiter exists (second --- after line 1)
  closing=$(tail -n +2 "$skill_file" | grep -n "^---$" | head -1)
  if [ -z "$closing" ]; then
    echo "ERROR: $skill_file has unclosed frontmatter"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Check line count
  lines=$(wc -l < "$skill_file" | tr -d ' ')
  if [ "$lines" -gt 500 ]; then
    echo "ERROR: $skill_file is $lines lines (max 500)"
    ERRORS=$((ERRORS + 1))
  fi

  # Check required frontmatter keys
  frontmatter_end=$(echo "$closing" | cut -d: -f1)
  frontmatter=$(head -n "$((frontmatter_end + 1))" "$skill_file")
  if ! echo "$frontmatter" | grep -q "^name:"; then
    echo "ERROR: $skill_file missing 'name:' in frontmatter"
    ERRORS=$((ERRORS + 1))
  fi
  if ! echo "$frontmatter" | grep -q "^description:"; then
    echo "ERROR: $skill_file missing 'description:' in frontmatter"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "Validation failed: $ERRORS error(s)"
  exit 1
fi

echo "All SKILL.md files valid ✓"

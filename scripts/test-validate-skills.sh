#!/usr/bin/env bash
# Tests for validate-skills.sh using temporary fixture files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VALIDATE="$SCRIPT_DIR/validate-skills.sh"
TMPDIR_BASE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BASE"' EXIT

pass=0
fail=0

run_test() {
  local name="$1" expected_exit="$2" fixture_dir="$3"
  local actual_exit=0

  cd "$fixture_dir"
  output=$(bash "$VALIDATE" 2>&1) || actual_exit=$?
  cd - > /dev/null

  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "  ✓ $name"
    pass=$((pass + 1))
  else
    echo "  ✗ $name (expected exit $expected_exit, got $actual_exit)"
    echo "    output: $output"
    fail=$((fail + 1))
  fi
}

# --- Fixtures ---

# Valid skill
mk_valid() {
  local d="$TMPDIR_BASE/valid"
  mkdir -p "$d/.claude/skills/test-skill"
  cat > "$d/.claude/skills/test-skill/SKILL.md" << 'EOF'
---
name: test-skill
description: A test skill
version: 1.0.0
---
# Test Skill

This is a valid skill.
EOF
  echo "$d"
}

# Missing frontmatter
mk_no_frontmatter() {
  local d="$TMPDIR_BASE/no-fm"
  mkdir -p "$d/.claude/skills/bad-skill"
  cat > "$d/.claude/skills/bad-skill/SKILL.md" << 'EOF'
# No Frontmatter

This skill has no frontmatter block.
EOF
  echo "$d"
}

# Unclosed frontmatter
mk_unclosed() {
  local d="$TMPDIR_BASE/unclosed"
  mkdir -p "$d/.claude/skills/unclosed-skill"
  cat > "$d/.claude/skills/unclosed-skill/SKILL.md" << 'EOF'
---
name: unclosed
description: Missing closing delimiter
EOF
  echo "$d"
}

# Over 500 lines
mk_too_long() {
  local d="$TMPDIR_BASE/long"
  mkdir -p "$d/.claude/skills/long-skill"
  {
    echo "---"
    echo "name: long-skill"
    echo "description: Too long"
    echo "---"
    for i in $(seq 1 500); do echo "Line $i"; done
  } > "$d/.claude/skills/long-skill/SKILL.md"
  echo "$d"
}

# Missing name key
mk_no_name() {
  local d="$TMPDIR_BASE/no-name"
  mkdir -p "$d/.claude/skills/no-name-skill"
  cat > "$d/.claude/skills/no-name-skill/SKILL.md" << 'EOF'
---
description: Missing name key
version: 1.0.0
---
# No Name
EOF
  echo "$d"
}

# Missing description key
mk_no_desc() {
  local d="$TMPDIR_BASE/no-desc"
  mkdir -p "$d/.claude/skills/no-desc-skill"
  cat > "$d/.claude/skills/no-desc-skill/SKILL.md" << 'EOF'
---
name: no-desc-skill
version: 1.0.0
---
# No Description
EOF
  echo "$d"
}

# No skills directory at all
mk_no_dir() {
  local d="$TMPDIR_BASE/empty"
  mkdir -p "$d"
  echo "$d"
}

# --- Run tests ---

echo "validate-skills.sh tests"
echo "========================"

run_test "valid skill passes"              0 "$(mk_valid)"
run_test "missing frontmatter warns (exit 0)"  0 "$(mk_no_frontmatter)"
run_test "unclosed frontmatter fails"      1 "$(mk_unclosed)"
run_test "over 500 lines fails"            1 "$(mk_too_long)"
run_test "missing name key fails"          1 "$(mk_no_name)"
run_test "missing description key fails"   1 "$(mk_no_desc)"
run_test "no skills dir passes"            0 "$(mk_no_dir)"

echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1

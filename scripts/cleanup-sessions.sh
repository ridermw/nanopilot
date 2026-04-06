#!/bin/bash
#
# Prune stale session artifacts (Copilot SDK state, SDK logs, container logs).
# Safe to run while NanoPilot is live — active sessions are read from the DB.
#
# Usage:  ./scripts/cleanup-sessions.sh [--dry-run]
#
# Retention:
#   Copilot session-state dirs:  7 days  (active session always kept)
#   Copilot SDK process logs:    3 days
#   Container run logs:          7 days

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

STORE_DB="$PROJECT_ROOT/store/messages.db"
SESSIONS_DIR="$PROJECT_ROOT/data/sessions"
GROUPS_DIR="$PROJECT_ROOT/groups"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

TOTAL_FREED=0

log() { echo "[cleanup] $*"; }

# Check for sqlite3
if ! command -v sqlite3 &>/dev/null; then
  log "ERROR: sqlite3 not found. Install it to enable session cleanup."
  exit 1
fi

remove() {
  local target="$1"
  if $DRY_RUN; then
    if [ -d "$target" ]; then
      size=$(du -sk "$target" 2>/dev/null | cut -f1)
    else
      size=$(wc -c < "$target" 2>/dev/null || echo 0)
      size=$((size / 1024))
    fi
    TOTAL_FREED=$((TOTAL_FREED + size))
    log "would remove: $target (${size}K)"
  else
    if [ -d "$target" ]; then
      size=$(du -sk "$target" 2>/dev/null | cut -f1)
      rm -rf "$target"
    else
      size=$(wc -c < "$target" 2>/dev/null || echo 0)
      size=$((size / 1024))
      rm -f "$target"
    fi
    TOTAL_FREED=$((TOTAL_FREED + size))
  fi
}

# --- Collect active session IDs from the database ---

if [ ! -f "$STORE_DB" ]; then
  log "ERROR: database not found at $STORE_DB"
  exit 1
fi

ACTIVE_IDS=$(sqlite3 "$STORE_DB" "SELECT session_id FROM sessions;" 2>/dev/null || true)

is_active() {
  echo "$ACTIVE_IDS" | grep -qF "$1"
}

# --- Prune stale Copilot session-state dirs (>7 days, skip active) ---

for group_dir in "$SESSIONS_DIR"/*/; do
  [ -d "$group_dir" ] || continue
  session_state_dir="$group_dir/.copilot/session-state"
  [ -d "$session_state_dir" ] || continue

  for session_dir in "$session_state_dir"/*/; do
    [ -d "$session_dir" ] || continue
    # Skip symlinks for safety
    [ -L "$session_dir" ] && continue

    uuid=$(basename "$session_dir")

    # Never delete the active session
    if is_active "$uuid"; then
      continue
    fi

    # Only delete if the directory is older than 7 days
    if [ -n "$(find "$session_dir" -maxdepth 0 -mtime +7 2>/dev/null)" ]; then
      remove "$session_dir"
    fi
  done
done

# --- Prune Copilot SDK process logs (>3 days) ---

for group_dir in "$SESSIONS_DIR"/*/; do
  logs_dir="$group_dir/.copilot/logs"
  [ -d "$logs_dir" ] || continue
  while IFS= read -r -d '' f; do
    # Skip symlinks for safety
    [ -L "$f" ] && continue
    remove "$f"
  done < <(find "$logs_dir" -type f -not -type l -name "process-*.log" -mtime +3 -print0 2>/dev/null)
done

# --- Prune container run logs (>7 days) ---

for group_dir in "$GROUPS_DIR"/*/; do
  logs_dir="$group_dir/logs"
  [ -d "$logs_dir" ] || continue
  while IFS= read -r -d '' f; do
    # Skip symlinks for safety
    [ -L "$f" ] && continue
    remove "$f"
  done < <(find "$logs_dir" -type f -not -type l -name "container-*.log" -mtime +7 -print0 2>/dev/null)
done

# --- Summary ---

if $DRY_RUN; then
  log "DRY RUN complete — would free ~${TOTAL_FREED}K"
else
  log "Done — freed ~${TOTAL_FREED}K"
fi

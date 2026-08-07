#!/usr/bin/env bash
# Clear oc-claw local app data / logs so a bad settings.json (or off-screen
# window state) cannot keep the desktop pet invisible across versions.
#
# Usage:
#   ./scripts/clear-oc-claw-data.sh          # backup then remove
#   ./scripts/clear-oc-claw-data.sh --yes    # no prompt
#   ./scripts/clear-oc-claw-data.sh --dry-run

set -euo pipefail

YES=0
DRY=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) YES=1 ;;
    -n|--dry-run) DRY=1 ;;
    -h|--help)
      sed -n '1,12p' "$0"
      exit 0
      ;;
  esac
done

BUNDLE_ID="com.openclaw.ooclaw"
STAMP="$(date +%Y%m%d-%H%M%S)"

paths=()
case "$(uname -s)" in
  Darwin)
    paths+=(
      "$HOME/Library/Application Support/${BUNDLE_ID}"
      "$HOME/Library/Logs/${BUNDLE_ID}"
      "$HOME/Library/Caches/${BUNDLE_ID}"
      "$HOME/Library/Preferences/${BUNDLE_ID}.plist"
      "$HOME/Library/WebKit/${BUNDLE_ID}"
      "$HOME/Library/HTTPStorages/${BUNDLE_ID}"
    )
    ;;
  Linux)
    DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
    CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
    paths+=(
      "${DATA_HOME}/${BUNDLE_ID}"
      "${CACHE_HOME}/${BUNDLE_ID}"
      "${DATA_HOME}/${BUNDLE_ID}/logs"
    )
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    echo "On Windows use: powershell -File scripts/clear-oc-claw-data.ps1" >&2
    exit 1
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

existing=()
for p in "${paths[@]}"; do
  if [ -e "$p" ]; then
    existing+=("$p")
  fi
done

if [ ${#existing[@]} -eq 0 ]; then
  echo "Nothing to clear for ${BUNDLE_ID}."
  exit 0
fi

echo "Will clear oc-claw local data (${BUNDLE_ID}):"
for p in "${existing[@]}"; do
  echo "  - $p"
done
echo
echo "Note: this clears ALL app data for ${BUNDLE_ID}, including:"
echo "      settings.json, characters/, and imported Live2D under .../live2d/"
echo "      custom sprite pets in ~/.codex/pets are NOT touched."
echo

if [ "$DRY" -eq 1 ]; then
  echo "Dry run — no changes."
  exit 0
fi

if [ "$YES" -ne 1 ]; then
  printf "Quit oc-claw first, then type YES to continue: "
  read -r ans
  if [ "$ans" != "YES" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# Best-effort quit so files are not locked.
if command -v pkill >/dev/null 2>&1; then
  pkill -f 'oc_claw' 2>/dev/null || true
  pkill -f 'oc-claw' 2>/dev/null || true
fi
if command -v killall >/dev/null 2>&1; then
  killall "oc-claw" 2>/dev/null || true
fi
sleep 0.5

BACKUP_ROOT="${TMPDIR:-/tmp}/oc-claw-data-backup-${STAMP}"
mkdir -p "$BACKUP_ROOT"

for p in "${existing[@]}"; do
  base="$(basename "$p")"
  parent="$(basename "$(dirname "$p")")"
  dest="${BACKUP_ROOT}/${parent}__${base}"
  echo "Backing up -> $dest"
  cp -a "$p" "$dest" 2>/dev/null || cp -R "$p" "$dest"
  rm -rf "$p"
  echo "Removed $p"
done

echo
echo "Done. Backup at: $BACKUP_ROOT"
echo "Restart oc-claw (or npx tauri dev) afterwards."

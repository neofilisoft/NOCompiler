#!/usr/bin/env bash
set -euo pipefail

NVECODE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VSCODE_SRC="$NVECODE_ROOT/vscode-source"
FONT_DIR="$NVECODE_ROOT/font-size"

log() {
  printf '[nvecode] %s\n' "$*"
}

warn() {
  printf '[nvecode][warn] %s\n' "$*" >&2
}

fail() {
  printf '[nvecode][error] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

python_cmd() {
  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
  elif command -v python >/dev/null 2>&1; then
    printf 'python'
  else
    fail 'Python is required'
  fi
}

package_version() {
  node -p "require('$NVECODE_ROOT/package.json').version"
}

sync_inter_fonts() {
  mkdir -p "$FONT_DIR"
  local copied=0
  local candidates=(
    "${WINDIR:-/c/Windows}/Fonts/Inter.ttc"
    "${WINDIR:-/c/Windows}/Fonts/InterVariable.ttf"
    "${WINDIR:-/c/Windows}/Fonts/InterVariable-Italic.ttf"
    "/c/Windows/Fonts/Inter.ttc"
    "/c/Windows/Fonts/InterVariable.ttf"
    "/c/Windows/Fonts/InterVariable-Italic.ttf"
    "/Library/Fonts/Inter.ttc"
    "/Library/Fonts/InterVariable.ttf"
    "/Library/Fonts/InterVariable-Italic.ttf"
  )

  for src in "${candidates[@]}"; do
    if [ -f "$src" ]; then
      cp -f "$src" "$FONT_DIR/$(basename "$src")"
      copied=1
    fi
  done

  if [ "$copied" -eq 1 ]; then
    log "Inter fonts synced into $FONT_DIR"
  else
    warn "Inter fonts were not found automatically. Copy them into $FONT_DIR manually if needed."
  fi
}

ensure_vscode_source() {
  [ -d "$VSCODE_SRC" ] || fail "vscode-source/ not found. Run ./scripts/cli.sh build or python scripts/build.py first."
}

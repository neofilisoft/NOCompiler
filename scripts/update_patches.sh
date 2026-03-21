#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./utils.sh
source "$SCRIPT_DIR/utils.sh"

ensure_vscode_source
require_cmd git

cd "$VSCODE_SRC"

git diff --binary -- src/vs/workbench/electron-sandbox/desktop.main.ts > "$NVECODE_ROOT/patches/0001-vecode-inject-ui.patch"
git diff --binary -- src/vs/workbench/browser/workbench.contribution.ts > "$NVECODE_ROOT/patches/0002-vecode-defaults.patch"

log "Updated patch files from current vscode-source working tree"

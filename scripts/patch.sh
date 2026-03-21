#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./utils.sh
source "$SCRIPT_DIR/utils.sh"

require_cmd node
PYTHON_BIN="$(python_cmd)"

sync_inter_fonts
log "Applying NVECode patches into vscode-source"
"$PYTHON_BIN" "$NVECODE_ROOT/scripts/build.py" --dev --skip-clone --skip-compile --skip-native "$@"

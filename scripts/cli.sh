#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./utils.sh
source "$SCRIPT_DIR/utils.sh"

PYTHON_BIN="$(python_cmd)"
CMD="${1:-help}"
shift || true

case "$CMD" in
  build)
    "$PYTHON_BIN" "$NVECODE_ROOT/scripts/build.py" "$@"
    ;;
  build-win)
    "$PYTHON_BIN" "$NVECODE_ROOT/scripts/build.py" --platform win "$@"
    ;;
  build-mac)
    "$PYTHON_BIN" "$NVECODE_ROOT/scripts/build.py" --platform mac "$@"
    ;;
  build-linux)
    "$PYTHON_BIN" "$NVECODE_ROOT/scripts/build.py" --platform linux "$@"
    ;;
  dev)
    "$PYTHON_BIN" "$NVECODE_ROOT/scripts/dev.py" "$@"
    ;;
  patch)
    "$SCRIPT_DIR/patch.sh" "$@"
    ;;
  sync-fonts)
    sync_inter_fonts
    ;;
  update-api)
    "$SCRIPT_DIR/update_api.sh" "$@"
    ;;
  update-patches)
    "$SCRIPT_DIR/update_patches.sh" "$@"
    ;;
  docker-linux)
    "$SCRIPT_DIR/build_docker.sh" "$@"
    ;;
  help|*)
    cat <<'EOF'
Usage: ./scripts/cli.sh <command>

Commands:
  build            Run python build.py
  build-win        Build Windows packages
  build-mac        Build macOS packages
  build-linux      Build Linux packages
  dev              Run the dev launcher
  patch            Apply patches only
  sync-fonts       Copy Inter fonts into font-size/
  update-api       Sync extension metadata with package.json
  update-patches   Export patch files from vscode-source git diff
  docker-linux     Build Linux packages in Docker
EOF
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./utils.sh
source "$SCRIPT_DIR/utils.sh"

require_cmd node

NVECODE_ROOT="$NVECODE_ROOT" node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.env.NVECODE_ROOT;
const packagePath = path.join(root, 'package.json');
const themePath = path.join(root, 'extensions', 'vecode-theme', 'package.json');

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));

theme.version = pkg.version;
theme.engines = theme.engines || {};
theme.engines.nvecode = `^${pkg.version}`;

fs.writeFileSync(themePath, `${JSON.stringify(theme, null, 2)}\n`, 'utf8');
console.log(`[nvecode] synced extension metadata to version ${pkg.version}`);
NODE

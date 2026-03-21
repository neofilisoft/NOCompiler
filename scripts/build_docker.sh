#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./utils.sh
source "$SCRIPT_DIR/utils.sh"

require_cmd docker

IMAGE="nvecode-linux-build:1.0.2"

docker build -t "$IMAGE" - <<'DOCKERFILE'
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y curl git python3 python3-pip build-essential cmake pkg-config rpm fakeroot libarchive-tools xz-utils && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get update && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
DOCKERFILE

docker run --rm \
  -v "$NVECODE_ROOT:/workspace" \
  -w /workspace \
  "$IMAGE" \
  bash -lc './scripts/cli.sh sync-fonts && python3 scripts/build.py --platform linux'

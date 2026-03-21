#!/usr/bin/env python3
"""
scripts/dev.py
NVECode - development launcher

  1. Applies patches (fast, no clone/compile)
  2. Launches Electron with NVECODE_DEV=1
  3. Watches renderer and font-size assets for quick sync into vscode-source

Usage: python scripts/dev.py [--no-watch]
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VSCODE_SRC = ROOT / "vscode-source"
WATCH_TARGETS = {
    ROOT / "src" / "renderer": VSCODE_SRC / "src" / "renderer",
    ROOT / "font-size": VSCODE_SRC / "font-size",
}

GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"


def info(msg: str) -> None:
    print(f"{GREEN}OK {msg}{RESET}")


def warn(msg: str) -> None:
    print(f"{YELLOW}WARN {msg}{RESET}")


def step(msg: str) -> None:
    print(f"\n{BLUE}== {msg}{RESET}")


def apply_patches() -> None:
    step("Quick-patch")
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / "build.py"),
            "--dev",
            "--skip-clone",
            "--skip-compile",
            "--skip-native",
        ],
        cwd=ROOT,
    )
    if result.returncode != 0:
        warn("Patch step had errors - continuing anyway")


def launch_electron():
    env = os.environ.copy()
    env["NVECODE_DEV"] = "1"
    env["ELECTRON_ENABLE_LOGGING"] = "1"

    for cmd in (
        ["npx", "electron", ".", "--no-sandbox"],
        ["electron", ".", "--no-sandbox"],
    ):
        if shutil.which(cmd[0]):
            info(f"Launching: {' '.join(cmd)}")
            return subprocess.Popen(cmd, cwd=VSCODE_SRC, env=env)

    warn("electron not found - run npm install in vscode-source/")
    sys.exit(1)


class Watcher(threading.Thread):
    def __init__(self, watch_map: dict[Path, Path]):
        super().__init__(daemon=True)
        self.watch_map = watch_map
        self.mtimes: dict[Path, float] = {}
        self.prime()

    def prime(self) -> None:
        for watch_dir in self.watch_map:
            if not watch_dir.exists():
                continue
            for item in watch_dir.rglob("*"):
                if item.is_file():
                    try:
                        self.mtimes[item] = item.stat().st_mtime
                    except OSError:
                        pass

    def run(self) -> None:
        while True:
            time.sleep(0.4)
            changed: list[Path] = []
            for watch_dir in self.watch_map:
                if not watch_dir.exists():
                    continue
                for item in watch_dir.rglob("*"):
                    if not item.is_file():
                        continue
                    try:
                        mtime = item.stat().st_mtime
                    except OSError:
                        continue
                    if mtime != self.mtimes.get(item):
                        self.mtimes[item] = mtime
                        changed.append(item)

            for item in changed:
                self.on_change(item)

    def on_change(self, file_path: Path) -> None:
        for watch_dir, dest_root in self.watch_map.items():
            try:
                rel = file_path.relative_to(watch_dir)
            except ValueError:
                continue
            dest = dest_root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, dest)
            print(f"\n{BLUE}SYNC {file_path.name}{RESET}")
            info(f"Copied to {dest}")
            if file_path.suffix in (".js", ".ts", ".css"):
                info("Reload the window with Ctrl+Shift+P > Reload Window")
            break


def main() -> None:
    parser = argparse.ArgumentParser(description="NVECode dev launcher")
    parser.add_argument("--no-watch", action="store_true", help="Disable file watcher")
    args = parser.parse_args()

    if not VSCODE_SRC.exists():
        warn("vscode-source not found. Running initial build...")
        subprocess.run([
            sys.executable,
            str(ROOT / "scripts" / "build.py"),
            "--dev",
            "--skip-native",
        ], cwd=ROOT, check=True)

    apply_patches()

    if not args.no_watch:
        watcher = Watcher(WATCH_TARGETS)
        watcher.start()
        for watch_dir in WATCH_TARGETS:
            info(f"Watching {watch_dir}")
    else:
        watcher = None

    proc = launch_electron()

    try:
        proc.wait()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Stopping...{RESET}")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()

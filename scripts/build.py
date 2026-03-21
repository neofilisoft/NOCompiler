#!/usr/bin/env python3
"""
scripts/build.py
NVECode - Master build script

Flow:
  1. Preflight   - check Node, Git, Python, C++ compiler
  2. Clone       - clone VSCodium at a pinned tag
  3. Patch       - apply patches/, replace product.json, inject extensions, sync font-size assets
  4. Validate    - report built-in syntax highlight coverage
  5. Compile     - npm ci + npm run compile inside vscode-source
  6. Native      - build vecode_native.node (node-gyp or cmake)
  7. Package     - electron-builder -> installers and bundles
  8. Normalize   - rename packaged outputs to nvecode.*
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VSCODE_SRC = ROOT / "vscode-source"
PATCHES_DIR = ROOT / "patches"
EXT_DIR = ROOT / "extensions"
CONFIG_DIR = ROOT / "config"
FONT_SIZE_DIR = ROOT / "font-size"
SYNTAX_MANIFEST = CONFIG_DIR / "builtin-syntax-languages.json"

VSCODIUM_TAG = "1.87.2.24068"
VSCODIUM_REPO = "https://github.com/VSCodium/vscodium.git"

BOLD = "\033[1m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
BLUE = "\033[34m"
RESET = "\033[0m"


def info(msg: str) -> None:
    print(f"{GREEN}OK {msg}{RESET}")


def warn(msg: str) -> None:
    print(f"{YELLOW}WARN {msg}{RESET}")


def step(msg: str) -> None:
    print(f"\n{BOLD}{BLUE}== {msg}{RESET}")


def err(msg: str) -> None:
    print(f"{RED}ERR {msg}{RESET}")
    sys.exit(1)


def run(cmd: list[str], cwd: Path | None = None, env=None, check: bool = True) -> subprocess.CompletedProcess:
    label = " ".join(str(part) for part in cmd)
    print(f"  {BLUE}>{RESET} {label}")
    return subprocess.run(cmd, cwd=cwd or ROOT, env=env or os.environ.copy(), check=check)


def run_out(cmd: list[str], cwd: Path | None = None) -> str:
    result = subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True)
    return result.stdout.strip()


def preflight(args) -> None:
    step("Preflight checks")

    ver_str = run_out(["node", "--version"])
    if not ver_str:
        err("Node.js not found - need >= 18")
    match = re.match(r"v(\d+)", ver_str)
    if not match or int(match.group(1)) < 18:
        err(f"Node.js 18+ required, found {ver_str}")
    info(f"Node.js {ver_str}")

    npm_ver = run_out(["npm", "--version"])
    if not npm_ver:
        err("npm not found")
    info(f"npm {npm_ver}")

    git_ver = run_out(["git", "--version"])
    if not git_ver:
        err("git not found")
    info(git_ver)

    if not args.skip_native:
        check_compiler()

    info(f"Python {sys.version.split()[0]}")


def check_compiler() -> None:
    if platform.system().lower() == "windows":
        for name in ("cl", "gcc", "clang"):
            if shutil.which(name):
                flag = "/?" if name == "cl" else "--version"
                version = run_out([name, flag])
                first_line = version.splitlines()[0] if version else name
                info(f"C++ compiler: {name} ({first_line})")
                return
        warn("No C++ compiler found - native addon will be skipped.")
        return

    for name in ("gcc", "g++", "clang", "clang++", "cc"):
        if shutil.which(name):
            version = run_out([name, "--version"])
            first_line = version.splitlines()[0] if version else name
            info(f"C++ compiler: {name} ({first_line})")
            return
    warn("No C++ compiler found - native addon will be skipped.")


def clean() -> None:
    step("Cleaning vscode-source")
    if VSCODE_SRC.exists():
        shutil.rmtree(VSCODE_SRC)
        info("Removed vscode-source/")


def clone(skip: bool) -> None:
    step("Clone VSCodium")
    if skip:
        warn("--skip-clone: skipping")
        return

    if VSCODE_SRC.exists():
        current = run_out(["git", "describe", "--tags", "--exact-match"], cwd=VSCODE_SRC)
        if current == VSCODIUM_TAG:
            info(f"Already at {VSCODIUM_TAG}")
            return
        warn(f"Updating to {VSCODIUM_TAG}")
        run(["git", "fetch", "--tags", "--depth=1"], cwd=VSCODE_SRC)
        run(["git", "checkout", f"tags/{VSCODIUM_TAG}", "-B", "vecode-base"], cwd=VSCODE_SRC)
    else:
        run(["git", "clone", "--depth", "1", "--branch", VSCODIUM_TAG, VSCODIUM_REPO, str(VSCODE_SRC)])

    info(f"VSCodium {VSCODIUM_TAG} ready at vscode-source/")


def patch(skip: bool) -> None:
    step("Apply patches")
    if skip:
        warn("--skip-patch: skipping")
        return

    src = ROOT / "product.json"
    dst = VSCODE_SRC / "product.json"
    if src.exists():
        shutil.copy2(src, dst)
        info("Replaced product.json")

    if PATCHES_DIR.exists():
        for patch_file in sorted(PATCHES_DIR.glob("*.patch")):
            result = run([
                "git",
                "apply",
                "--ignore-whitespace",
                "--ignore-space-change",
                str(patch_file),
            ], cwd=VSCODE_SRC, check=False)
            if result.returncode != 0:
                warn(f"{patch_file.name}: already applied or conflict (skipped)")
            else:
                info(f"Applied {patch_file.name}")

    ext_dest = VSCODE_SRC / "extensions"
    if EXT_DIR.exists():
        for ext in EXT_DIR.iterdir():
            if not ext.is_dir():
                continue
            dst_ext = ext_dest / ext.name
            if dst_ext.exists():
                shutil.rmtree(dst_ext)
            shutil.copytree(ext, dst_ext)
            info(f"Bundled extension: {ext.name}")

    sync_tree(FONT_SIZE_DIR, VSCODE_SRC / "font-size", "font-size assets")
    inject_file(ROOT / "src/main/main.js", VSCODE_SRC / "src/main.js", "main.js")
    inject_file(ROOT / "src/main/preload.js", VSCODE_SRC / "src/vs/workbench/electron-sandbox/preload.js", "preload.js")
    inject_file(ROOT / "src/renderer/vecode-overrides.css", VSCODE_SRC / "src/renderer/vecode-overrides.css", "vecode-overrides.css")
    inject_file(ROOT / "src/renderer/titlebar.js", VSCODE_SRC / "src/renderer/titlebar.js", "titlebar.js")


def sync_tree(src: Path, dst: Path, label: str) -> None:
    if not src.exists():
        return
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    info(f"Synced {label}")


def inject_file(src: Path, dst: Path, label: str) -> None:
    if not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    info(f"Injected {label}")


def validate_builtin_syntax() -> None:
    step("Validate built-in syntax highlighting")

    if not SYNTAX_MANIFEST.exists():
        warn("Missing config/builtin-syntax-languages.json")
        return

    manifest = json.loads(SYNTAX_MANIFEST.read_text(encoding="utf-8"))
    entries = manifest.get("languages", [])
    ext_roots = [VSCODE_SRC / "extensions", EXT_DIR]

    supported: list[str] = []
    missing: list[str] = []

    for entry in entries:
        language = entry["language"]
        folders = entry.get("folders", [])
        found = any((root / folder).exists() for root in ext_roots for folder in folders)
        if found:
            supported.append(language)
        else:
            missing.append(language)

    info(f"Syntax manifest covered: {len(supported)}/{len(entries)} languages")
    if missing:
        warn("Missing syntax bundles for: " + ", ".join(missing))
        warn("Add matching extensions under ./extensions or switch to a VSCodium tag that ships them.")


def compile_vscode(skip: bool, dev: bool) -> None:
    step("Compile VSCodium")
    if skip:
        warn("--skip-compile: skipping")
        return

    info("Running npm ci")
    run(["npm", "ci"], cwd=VSCODE_SRC)

    info("Compiling TypeScript")
    run(["npm", "run", "compile"], cwd=VSCODE_SRC)

    if not dev:
        info("Minifying")
        run(["npm", "run", "minify"], cwd=VSCODE_SRC, check=False)


def build_native(skip: bool) -> None:
    step("Build native addon (vecode_native.node)")
    if skip:
        warn("--skip-native: skipping")
        return

    if shutil.which("node-gyp"):
        result = run(["node-gyp", "rebuild"], cwd=ROOT, check=False)
        if result.returncode == 0:
            info("Built with node-gyp")
            return
        warn("node-gyp failed, trying CMake")

    cmake_build = ROOT / "build" / "_cmake_build"
    cmake_src = ROOT / "build"
    cmake_build.mkdir(parents=True, exist_ok=True)

    result = run(["cmake", str(cmake_src), "-DCMAKE_BUILD_TYPE=Release"], cwd=cmake_build, check=False)
    if result.returncode != 0:
        warn("CMake configure failed - skipping native addon")
        return

    result = run(["cmake", "--build", ".", "--config", "Release", "--target", "deploy"], cwd=cmake_build, check=False)
    if result.returncode == 0:
        info("Built with CMake")
    else:
        warn("Native addon build failed - IDE will work without it")


def package(target: str, arch: str, dev: bool) -> None:
    step(f"Package ({target}/{arch})")
    if dev:
        warn("--dev: skipping electron-builder")
        info("To test: cd vscode-source && npx electron . --no-sandbox")
        return

    cfg = {
        "appId": "com.neofilisoft.nvecode",
        "productName": "NVECode",
        "copyright": "Copyright (c) 2024 NVECode contributors",
        "directories": {
            "buildResources": str(ROOT / "resources"),
            "output": str(ROOT / "dist"),
        },
        "files": [
            "out/**",
            "extensions/**",
            "font-size/**",
            "node_modules/**",
            "product.json",
            "package.json",
        ],
        "extraResources": [
            {
                "from": str(ROOT / "build/Release"),
                "to": "build/Release",
                "filter": ["*.node"],
            }
        ],
        "win": {
            "target": [
                {"target": "nsis", "arch": ["x64", "arm64"]},
                {"target": "portable", "arch": ["x64"]},
            ],
            "icon": str(ROOT / "resources/icons/icon.ico"),
            "publisherName": "Neofilisoft",
        },
        "nsis": {
            "oneClick": False,
            "perMachine": False,
            "allowToChangeInstallationDirectory": True,
            "createDesktopShortcut": True,
            "shortcutName": "NVECode",
        },
        "mac": {
            "target": [
                {"target": "dmg", "arch": ["universal"]},
                {"target": "zip", "arch": ["universal"]},
            ],
            "icon": str(ROOT / "resources/icons/icon.icns"),
            "category": "public.app-category.developer-tools",
            "hardenedRuntime": True,
            "gatekeeperAssess": False,
        },
        "linux": {
            "target": ["AppImage", "deb", "rpm"],
            "icon": str(ROOT / "resources/icons"),
            "category": "Development",
        },
        "publish": None,
    }

    cfg_path = VSCODE_SRC / ".vecode-builder.json"
    cfg_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    platform_flags = {
        "win": ["--win"],
        "mac": ["--mac"],
        "linux": ["--linux"],
    }.get(target, ["--linux"])

    arch_flag = "--x64" if arch == "x64" else "--arm64"
    run(["npx", "electron-builder", "--config", str(cfg_path)] + platform_flags + [arch_flag], cwd=VSCODE_SRC)
    cfg_path.unlink(missing_ok=True)
    normalize_artifacts(target)
    info(f"Output -> {ROOT / 'dist'}")


def normalize_artifacts(target: str) -> None:
    step("Normalize package names")
    dist = ROOT / "dist"
    if not dist.exists():
        warn("dist/ does not exist yet")
        return

    renamed: list[Path] = []

    def replace_path(path: Path, target_name: str) -> None:
        if not path.exists():
            return
        destination = path.with_name(target_name)
        if path == destination:
            return
        if destination.exists():
            if destination.is_dir():
                shutil.rmtree(destination)
            else:
                destination.unlink()
        path.rename(destination)
        renamed.append(destination)

    if target == "win":
        for unpacked_dir in sorted(dist.glob("*unpacked")):
            exe_files = [exe for exe in unpacked_dir.glob("*.exe") if exe.name.lower() != "nvecode.exe"]
            if exe_files:
                replace_path(exe_files[0], "nvecode.exe")
                break
        portable_candidates = [p for p in dist.glob("*.exe") if "setup" not in p.name.lower() and p.name.lower() != "nvecode.exe"]
        if portable_candidates:
            replace_path(portable_candidates[0], "nvecode.exe")

    if target == "mac":
        app_candidates = [p for p in dist.rglob("*.app") if p.name != "nvecode.app"]
        if app_candidates:
            replace_path(app_candidates[0], "nvecode.app")

    if target == "linux":
        for suffix, final_name in ((".AppImage", "nvecode.AppImage"), (".deb", "nvecode.deb"), (".rpm", "nvecode.rpm")):
            candidates = [p for p in dist.glob(f"*{suffix}") if p.name != final_name]
            if candidates:
                replace_path(candidates[0], final_name)

    if renamed:
        for path in renamed:
            info(f"Renamed output: {path.name}")
    else:
        warn("No packaged outputs needed renaming")


def detect_platform(arg: str | None) -> str:
    if arg:
        return arg
    system_name = platform.system().lower()
    if system_name == "windows":
        return "win"
    if system_name == "darwin":
        return "mac"
    return "linux"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build NVECode",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(
            """
            Examples:
              python scripts/build.py --dev
              python scripts/build.py --platform win
              python scripts/build.py --platform mac
              python scripts/build.py --platform linux
              python scripts/build.py --clean
            """
        ),
    )
    parser.add_argument("--platform", choices=["win", "mac", "linux"])
    parser.add_argument("--arch", choices=["x64", "arm64"], default="x64")
    parser.add_argument("--dev", action="store_true")
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--skip-clone", action="store_true")
    parser.add_argument("--skip-patch", action="store_true")
    parser.add_argument("--skip-compile", action="store_true")
    parser.add_argument("--skip-native", action="store_true")
    args = parser.parse_args()

    target = detect_platform(args.platform)
    print(f"\n{BOLD}NVECode build 1.0.2 - {target}/{args.arch}{RESET}\n")

    if args.clean:
        clean()

    preflight(args)
    clone(args.skip_clone)
    patch(args.skip_patch)
    validate_builtin_syntax()
    compile_vscode(args.skip_compile, args.dev)
    build_native(args.skip_native)
    package(target, args.arch, args.dev)

    print(f"\n{BOLD}{GREEN}Build complete.{RESET}\n")


if __name__ == "__main__":
    main()

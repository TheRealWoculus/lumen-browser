#!/usr/bin/env bash
# Full compile: deps, native modules (node-llama-cpp, sqlite), Linux release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/app"

unset ELECTRON_RUN_AS_NODE 2>/dev/null || true
export ELECTRON_RUN_AS_NODE=

echo "==> Installing dependencies…"
npm install

echo "==> Rebuilding native modules for Electron…"
env -u ELECTRON_RUN_AS_NODE npx electron-builder install-app-deps

echo "==> Building Linux packages…"
env -u ELECTRON_RUN_AS_NODE npm run build:linux

mkdir -p "$ROOT/downloads"
shopt -s nullglob
for f in "$ROOT/releases"/*; do
  cp -fv "$f" "$ROOT/downloads/" || true
done
for f in "$ROOT/releases"/*linux*.tar.gz; do
  cp -fv "$f" "$ROOT/downloads/Lumen-1.0.0-linux-x64.tar.gz" 2>/dev/null || true
done

echo "==> Done. Releases in $ROOT/releases and $ROOT/downloads"

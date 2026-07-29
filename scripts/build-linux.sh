#!/usr/bin/env bash
# Build Lumen for Linux (AppImage + tar.gz). Works on most distros with Node 18+.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/app"

if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 18+ (https://nodejs.org) and re-run."
  exit 1
fi

export -n ELECTRON_RUN_AS_NODE 2>/dev/null || true
npm install
env -u ELECTRON_RUN_AS_NODE npm run build:linux

mkdir -p "$ROOT/downloads"
shopt -s nullglob
for f in "$ROOT/releases"/*linux*.tar.gz "$ROOT/releases"/*.AppImage; do
  cp -f "$f" "$ROOT/downloads/" 2>/dev/null || true
  base=$(basename "$f")
  cp -f "$f" "$ROOT/downloads/Lumen-1.0.0-linux-x64.tar.gz" 2>/dev/null || cp -f "$f" "$ROOT/downloads/$base"
done

echo "Done. Artifacts in $ROOT/downloads/"

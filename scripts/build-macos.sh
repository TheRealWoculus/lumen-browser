#!/usr/bin/env bash
# Build Lumen for macOS (dmg + zip). Run on macOS with Xcode command-line tools.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS builds must run on a Mac. Use build-linux.sh on Linux."
  exit 1
fi

npm install
npm run build:mac

mkdir -p "$ROOT/downloads"
shopt -s nullglob
for f in "$ROOT/releases"/*.dmg "$ROOT/releases"/*mac*.zip; do
  cp -f "$f" "$ROOT/downloads/" 2>/dev/null || true
  cp -f "$f" "$ROOT/downloads/Lumen-1.0.0-macos.dmg" 2>/dev/null || true
done

echo "Done. Artifacts in $ROOT/downloads/"

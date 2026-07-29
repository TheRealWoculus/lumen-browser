#!/bin/bash
set -e
echo "Lumen Browser - Linux Build"
echo "=========================="

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$BASE/build/linux_release"
DIST="$BASE/dist/linux"

echo "[1] Generating icons..."
python3 "$BASE/scripts/generate_icons.py"

echo "[2] CMake configure..."
cmake -S "$BASE" -B "$BUILD" -G Ninja   -DCMAKE_BUILD_TYPE=Release   -DLUMEN_SANDBOX=ON -DLUMEN_GPU=ON   -DLUMEN_ADBLOCKER=ON -DLUMEN_READER=ON   -DLUMEN_PIP=ON -DLUMEN_TRANSLATE=ON   -DLUMEN_LTO=ON

echo "[3] Building..."
cmake --build "$BUILD" --parallel $(nproc)

echo "[4] Installing..."
mkdir -p "$DIST"
cp "$BUILD/Lumen" "$DIST/"
cp -r "$BASE/assets/themes" "$DIST/"

echo ""
echo "Build complete: $DIST/Lumen"

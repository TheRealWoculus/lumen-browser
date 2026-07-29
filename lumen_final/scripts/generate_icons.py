#!/usr/bin/env python3
"""Generate all icon sizes from lumen logo PNG and produce multi-layer .ico"""
import os, sys
from pathlib import Path
try:
    from PIL import Image
except ImportError:
    print("pip install Pillow"); sys.exit(1)

BASE = Path(__file__).parent.parent
SRC  = BASE / "assets" / "logo" / "lumen_recolored.png"
OUT  = BASE / "assets" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

if not SRC.exists():
    print(f"Logo not found: {SRC}"); sys.exit(1)

src = Image.open(SRC).convert("RGBA")
for s in [16,24,32,48,64,128,256,512,1024]:
    img = src.resize((s,s), Image.LANCZOS)
    img.save(OUT / f"lumen_{s}.png")
    print(f"  {s}x{s}")

ico_imgs = [src.resize((s,s),Image.LANCZOS) for s in [256,128,64,48,32,16]]
ico_imgs[0].save(
    OUT / "lumen.ico", format="ICO",
    sizes=[(s,s) for s in [256,128,64,48,32,16]],
    append_images=ico_imgs[1:])
src.resize((256,256),Image.LANCZOS).save(OUT / "lumen.png")
print(f"\n  ICO -> {OUT}/lumen.ico")
print("Done!")

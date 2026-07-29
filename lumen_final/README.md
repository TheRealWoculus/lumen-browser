# Lumen Browser

**Fast. Private. Yours.**

Ultra-modern Chromium-based browser with 70+ built-in features, C++20/Qt 6.6, MIT License.

## Features Highlights (70+)
- Smart Tab Suspension (80–150 MB freed per idle tab)
- Background CPU Throttling
- Built-in Ad & Tracker Blocker (EasyList + uBlock)
- Reader Mode (Readability.js, TTS, themes)
- Picture-in-Picture (all HTML5 video)
- Built-in Page Translation (100+ languages)
- Screenshot Tool (visible/full-page/region)
- Tab Groups, Workspaces, Vertical Tabs
- Live Performance Dashboard (CPU/RAM/GPU/Net sparklines)
- Command Palette (Ctrl+K)
- Mouse Gestures
- Optional E2EE Sync (Argon2 + AES-256-GCM)
- Gaming Mode & Battery Saver Mode
- Multi-Profile Support
- Import from Chrome, Edge, Firefox, Brave, Opera
- Anti-Fingerprinting Suite
- DNS over HTTPS
- Back-Forward Cache
- Custom CSS/JS per domain
- Video Speed/Loop/Screenshot controls
- QR Code generator
- Split View
- Custom Accent Color
- Full DevTools (F12)
- ...and 45+ more

## Quick Build (Windows)

```bat
# 1. Install prerequisites: VS 2022, CMake, Qt 6.6, CEF 119.x, vcpkg
scripts\install_deps_windows.bat

# 2. Generate icons
python scripts\generate_icons.py

# 3. Build
scripts\build_windows.bat
# → dist\windows\Lumen.exe
```

## Tech Stack
- Chromium 120 / Blink / V8
- CEF 119.x
- Qt 6.6 (WebEngineWidgets + Multimedia)
- C++20 (MSVC 2022 / Clang 17)
- CMake 3.20 + Ninja
- nlohmann/json, spdlog, LevelDB, OpenSSL 3.x
- vcpkg (static linking)

## License
MIT License — see LICENSE file.

# Lumen Browser

A privacy-focused, feature-rich browser built on Electron.

## Features

- **Bookmarks** — Save and manage bookmarks (Ctrl+D to toggle, Ctrl+Shift+B to open manager)
- **Pinned Tabs** — Pin important tabs for quick access (right-click → Pin tab)
- **Tab Groups** — Organize tabs with colored groups (right-click → Add to group)
- **Tab Hibernation** — Freeze background tabs to save memory (right-click → Hibernate tab)
- **Recently Closed** — Reopen closed tabs (Ctrl+Shift+T)
- **Keyboard Shortcuts** — Full keyboard navigation
- **Right-Click Context Menu** — Tab context menu with Pin, Hibernate, Group, Duplicate, Close
- **Extensions (Experimental)** — Load unpacked Chrome extensions (Manifest V2/V3)
- **AI Assistant** — Built-in AI sidebar powered by Anthropic API or local GGUF models
- **Lumen Search** — Private local web crawler and search index
- **Password Manager** — Local password storage
- **18+ Mode** — Built-in adult content blocker
- **Performance Controls** — RAM limits, GPU/network/CPU throttling
- **Customizable Appearance** — Accent colors, wallpaper, dark/light/system themes

## Installation

### Windows
Download `Lumen Setup 1.0.0.exe` from the [releases page](https://github.com/anomalyco/lumen-browser/releases) and run the installer.

### macOS
Download `Lumen-1.0.0-macos.dmg` and drag the app to Applications.

### Linux
Download `Lumen-1.0.0-x86_64.AppImage` (recommended), make it executable, and run:
```
chmod +x Lumen-1.0.0-x86_64.AppImage
./Lumen-1.0.0-x86_64.AppImage
```
Alternatively, download `lumen-browser-1.0.0.tar.gz` and extract it.

### ChromeOS
Download `Lumen-1.0.0-x86_64.AppImage` or `lumen-browser-1.0.0.tar.gz` (Linux-compatible), extract the archive or run the AppImage with `--no-sandbox` if needed.

## Build

### Prerequisites
- Node.js 20+
- npm

### Quick start
```
npm install
npm start
```

### Build for distribution
```
npm run build
```

### Platform-specific builds
| Platform | Command | Notes |
|---|---|---|
| Windows | `npm run build:win` | Produces .exe installer and portable .exe |
| Linux | `npm run build:linux` | Produces .AppImage |
| macOS | `npm run build:mac` | Produces .dmg (requires macOS) |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / Previous tab |
| Ctrl+1–9 | Switch to tab by index |
| Ctrl+L | Focus address bar |
| Ctrl+F | Find in page |
| Ctrl+R | Reload |
| Ctrl+D | Toggle bookmark |
| Ctrl+Shift+T | Reopen closed tab |
| Ctrl+Shift+B | Open bookmark manager |

## Keyboard Shortcuts (macOS)

Replace Ctrl with Cmd for all shortcuts above.

## Settings

- **Appearance** — Accent color, secondary accent, wallpaper, wallpaper fit mode
- **Search** — Default search engine, Lumen Search toggle
- **AI Assistant** — Provider selection (Anthropic API / local GGUF), API key, local model path
- **General** — Home page, theme, docs link, clear history
- **Performance** — Max RAM, GPU/network/CPU limiters, hibernate all background tabs
- **Passwords** — View and delete saved passwords
- **Privacy** — 18+ Mode adult content blocker
- **Bookmarks** — View and manage bookmarks
- **Extensions** — Load/unload unpacked Chrome extensions

## Architecture

```
lumen-browser/
├── app/
│   ├── main/
│   │   ├── main.js          # Main process: window, IPC, context menu
│   │   └── preload.js       # Preload script: IPC bridge
│   └── renderer/
│       ├── index.html        # Browser UI shell
│       ├── app.js            # Renderer logic
│       ├── styles.css        # Styles
│       ├── newtab.html       # New tab page
│       └── icons.js          # SVG icon definitions
├── assets/                   # Icons and images
├── downloads/                # Build artifacts
├── lumen_browser.html        # Documentation page
└── package.json              # Build configuration
```

## Technical Notes

- Bookmarks, passwords, recently closed tabs, and loaded extensions are stored in `settings.json` in the OS userData directory.
- Tab hibernation preserves navigation state by storing the URL and loading `about:blank` in the webview.
- Right-click context menu for web content uses Electron's native `Menu` API (handled in main.js).
- Right-click context menu for tabs uses a custom HTML-based menu in the renderer for access to tab data.
- Chrome extension support uses `session.loadExtension()` (experimental, best results with Manifest V2).
- SVG icons are defined globally in `icons.js` and used inline throughout the UI.

## License

MIT

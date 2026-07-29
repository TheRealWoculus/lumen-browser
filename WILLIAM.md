# William v3 (williamv3.zip)

William ships as a **Windows `.exe`** plus docs (`william-docs.html`, `WILLIAM-source.zip`). It is not a native Linux/macOS binary.

## Linux

- Run the `.exe` via **Wine** or a Windows VM, or use the HTML docs locally.
- Extract: `unzip ~/Desktop/williamv3.zip -d ~/william-v3`
- Open `william-docs.html` in Lumen or any browser for setup notes.

## Claude / API

William is described as using **Claude via Anthropic’s API**. In Lumen Browser:

1. Open **Settings → AI Assistant**
2. Paste your [Anthropic API key](https://console.anthropic.com/)
3. Use the **✦ sidebar** to chat (same API family as William)

Keys stay in `~/.config/lumen-browser/settings.json` (or the Electron userData path) on your machine only.

## macOS

Same as Linux: Wine/CrossOver, VM, or use Lumen’s built-in AI assistant with your API key instead of the Windows launcher.

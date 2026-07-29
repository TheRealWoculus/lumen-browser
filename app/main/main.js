const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  nativeTheme,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { LumenSearchEngine } = require('./lumen-search');
const localAi = require('./local-ai');

const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

let mainWindow = null;
let searchEngine = null;

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

const defaultSettings = () => ({
  accent: '#7C3AED',
  accentSecondary: '#06B6D4',
  wallpaper: '',
  wallpaperMode: 'cover',
  defaultSearch: 'duckduckgo',
  lumenSearchEnabled: false,
  homePage: 'lumen://newtab',
  aiApiKey: '',
  aiProvider: 'anthropic',
  localModelPath: '',
  localContextSize: 4096,
  localGpuLayers: 'auto',
  sidebarOpen: false,
});

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), 'utf8');
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
}

function ensureSearchEngine(settings) {
  if (!searchEngine) {
    searchEngine = new LumenSearchEngine(app.getPath('userData'));
    searchEngine.init();
  }
  if (settings.lumenSearchEnabled) searchEngine.startCrawler();
  else searchEngine.stopCrawler();
}

function createWindow() {
  const settings = loadSettings();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    backgroundColor: '#07070E',
    icon: process.platform === 'win32'
      ? path.join(__dirname, '../../lumen.ico')
      : path.join(__dirname, '../../lumen_final/assets/icons/lumen_256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      mainWindow.webContents.send('open-url-new-tab', url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  session.defaultSession.on('will-download', (_event, item) => {
    const downloads = app.getPath('downloads');
    item.setSavePath(path.join(downloads, item.getFilename()));
    mainWindow?.webContents.send('download-progress', {
      name: item.getFilename(),
      state: 'started',
    });
    item.on('updated', (_e, state) => {
      mainWindow?.webContents.send('download-progress', {
        name: item.getFilename(),
        state,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
      });
    });
    item.once('done', (_e, state) => {
      mainWindow?.webContents.send('download-progress', {
        name: item.getFilename(),
        state: state === 'completed' ? 'done' : 'failed',
      });
    });
  });

  ensureSearchEngine(settings);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  searchEngine?.close();
  if (!isMac) app.quit();
});

/* ── IPC ── */

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('set-settings', (_e, partial) => {
  const next = { ...loadSettings(), ...partial };
  saveSettings(next);
  ensureSearchEngine(next);
  nativeTheme.themeSource = next.theme === 'light' ? 'light' : 'dark';
  return next;
});

ipcMain.handle('lumen-search', (_e, query) => {
  if (!searchEngine) return [];
  const settings = loadSettings();
  if (!settings.lumenSearchEnabled) return [];
  return searchEngine.search(query);
});

ipcMain.handle('lumen-search-stats', () => searchEngine?.stats() ?? { pages: 0, queued: 0 });

ipcMain.handle('toggle-lumen-search', (_e, enabled) => {
  const next = { ...loadSettings(), lumenSearchEnabled: !!enabled };
  saveSettings(next);
  ensureSearchEngine(next);
  return next;
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('pick-wallpaper', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
  });
  if (canceled || !filePaths[0]) return null;
  return `file://${filePaths[0]}`;
});

ipcMain.handle('pick-local-model', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Local models', extensions: ['gguf', 'bin'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle('load-local-model', async (_e, { modelPath, contextSize, gpuLayers }) => {
  const settings = loadSettings();
  const pathToLoad = modelPath || settings.localModelPath;
  if (!pathToLoad) throw new Error('No model path selected');
  const result = await localAi.loadModel(pathToLoad, {
    contextSize: contextSize ?? settings.localContextSize ?? 4096,
    gpuLayers: gpuLayers ?? settings.localGpuLayers ?? 'auto',
  });
  const next = { ...settings, localModelPath: pathToLoad, aiProvider: 'local' };
  saveSettings(next);
  mainWindow?.webContents.send('local-ai-status', localAi.status());
  return result;
});

ipcMain.handle('unload-local-model', async () => {
  await localAi.unloadModel();
  mainWindow?.webContents.send('local-ai-status', localAi.status());
  return { ok: true };
});

ipcMain.handle('local-ai-status', () => localAi.status());

ipcMain.handle('ai-chat', async (_e, payload) => {
  const { messages, apiKey, provider } = payload;
  const settings = loadSettings();
  const mode = provider || settings.aiProvider || 'anthropic';

  if (mode === 'local') {
    try {
      if (!localAi.status().loaded && settings.localModelPath) {
        await localAi.loadModel(settings.localModelPath, {
          contextSize: settings.localContextSize ?? 4096,
          gpuLayers: settings.localGpuLayers ?? 'auto',
        });
      }
      const text = await localAi.chat(messages, {
        maxTokens: payload.maxTokens ?? 512,
        temperature: payload.temperature ?? 0.7,
      });
      return { role: 'assistant', content: text };
    } catch (err) {
      return {
        role: 'assistant',
        content: `Local AI: ${err.message}. Load a .gguf or .bin file in Settings → AI Assistant.`,
      };
    }
  }

  const key = apiKey || settings.aiApiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      role: 'assistant',
      content:
        'Use cloud Claude (add API key) or switch to Local model and load a .gguf / .bin file in Settings → AI Assistant.',
    };
  }
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err.slice(0, 200));
    }
    const data = await res.json();
    const text = data.content?.find((c) => c.type === 'text')?.text ?? 'No response.';
    return { role: 'assistant', content: text };
  } catch (err) {
    return {
      role: 'assistant',
      content: `AI request failed: ${err.message}. Check your API key and network.`,
    };
  }
});

ipcMain.handle('resolve-path', (_e, relativePath) => {
  const base = path.join(__dirname, '../..');
  return path.join(base, relativePath);
});

ipcMain.handle('get-guest-preload-path', () =>
  path.join(__dirname, 'guest-preload.js')
);

ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

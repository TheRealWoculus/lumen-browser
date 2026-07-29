const { app, BrowserWindow, ipcMain, shell, session, nativeTheme, dialog, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { LumenSearchEngine } = require('./lumen-search');
const localAi = require('./local-ai');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {} 
const isPackaged = app.isPackaged;

const isMac = process.platform === 'darwin';
let mainWindow = null;
let searchEngine = null;
let activeDownloads = [];
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

const ADULT_DOMAINS = new Set([
  'pornhub.com','xvideos.com','xnxx.com','xhamster.com','redtube.com',
  'youporn.com','tube8.com','spankbang.com','porntube.com','alphaporno.com',
  'brazzers.com','bangbros.com','naughtyamerica.com','realitykings.com',
  'mofos.com','teamskeet.com','vixen.com','blacked.com','tushy.com','tushyraw.com',
  'onlyfans.com','loyalfans.com','fansly.com','manyvids.com','clips4sale.com',
  'adulttime.com','evilangel.com','julesjordan.com','newsensations.com',
  'hustler.com','penthouse.com','playboy.com','stripchat.com','chaturbate.com',
  'camsoda.com','myfreecams.com','livejasmin.com','flingster.com',
  'omegle.com','chatrandom.com','sexchat.com','adultfriendfinder.com',
  'ashleymadison.com','fetlife.com','alt.com','bondage.com',
  'kink.com','hentaihaven.xxx','hanime.tv','nhentai.net',
  '8muses.com','literotica.com','asstr.org','sexstories.com',
  'erotica.com','tnaflix.com','keezmovies.com','eporner.com',
  'pornhd.com','iceporn.com','videosection.com','porn300.com',
  'porn.is','porndoe.com','hqporner.com','porn7.xxx',
  'pornhubpremium.com','perfectgirls.xxx','scroller.xxx',
  'voyeurhit.com','pissing.com','txxx.com','sxyprn.com',
  'pornone.com','ok.xxx','anyporn.com','pornxs.com',
  'sex.com','xxx.com','adultnet.net','rabbitsreviews.com',
  'pornstar.com','pornez.com','pornwhite.com','porn00.org',
  'camwhores.tv','camvideos.tv','pornwild.to','pornhdvideos.net',
  'watchporn.to','xvideos2.com','xhamster2.com','theporndude.com',
]);

const AD_BLOCK_DOMAINS = new Set([
  'doubleclick.net','googlesyndication.com','googleadservices.com','googletagmanager.com',
  'google-analytics.com','googletagservices.com','adservice.google.com','ads.google.com',
  'pagead2.googlesyndication.com','adservice.google.co.uk','adservice.google.de',
  'adservice.google.fr','adservice.google.ca','adservice.google.co.jp',
  'facebook.com/tr','connect.facebook.net','pixel.facebook.com','an.facebook.com',
  'ads.twitter.com','t.co','analytics.twitter.com','static.ads-twitter.com',
  'ads.linkedin.com','analytics.linkedin.com','bat.bing.com',
  'scorecardresearch.com','comscore.com','quantserve.com','quantcast.com',
  'criteo.com','criteo.net','casalemedia.com','casalemedia.com',
  'adsrvr.org','adsymptotic.com','adnxs.com','appnexus.com','rubiconproject.com',
  'pubmatic.com','openx.net','openx.com','indexww.com','indexexchange.com',
  'sovrn.com','lijit.com','contextweb.com','bidswitch.net','adform.net',
  'adroll.com','amazon-adsystem.com','aax.amazon-adsystem.com',
  'advertising.amazon.com','adsrv.microsoft.com','adtech.com','adtech.de',
  'adzerk.net','exoclick.com','exosrv.com','propellerads.com','popads.net',
  'adcash.com','adf.ly','adfly.com','ouo.io','shorte.st','linkvertise.com',
  'taboola.com','taboolasyndication.com','outbrain.com','outbrainimg.com',
  'disqus.com','disqusads.com','revcontent.com','content.ad',
  'nativo.com','triplelift.com','sail-horizon.com','media.net',
  'adstxt.org','adsafeprotected.com','moatads.com','moat.com',
  'integralads.com','trustarc.com','onetrust.com','cookiebot.com',
  'demdex.net','krxd.net','rlcdn.com','bluekai.com','exelator.com',
  'tapad.com','lotame.com','dwin1.com','tagmanager.com',
  '2mdn.net','ytimg.com/vi/','googlevideo.com/videoplayback',
]);

const ADULT_KEYWORDS = [
  'porn','xxx','adult','nsfw','sex','hentai','nude','naked',
  'fuck','cock','dick','pussy','tits','boobs','bdsm','incest',
  'milf','teen','anal','blowjob','cumshot','creampie','gangbang',
  'bukkake','fetish','kink','bondage','domination','submission',
  'camgirl','webcam','stripchat','chaturbate','onlyfans',
  'lolic','shota','guro','scat','vore','furry',
];

const defaultSettings = () => ({
  accent: '#7C3AED', accentSecondary: '#06B6D4',
  wallpaper: '', wallpaperMode: 'cover',
  defaultSearch: 'duckduckgo', lumenSearchEnabled: false,
  homePage: 'lumen://newtab',
  aiApiKey: '', aiProvider: 'anthropic',
  localModelPath: '', localContextSize: 4096, localGpuLayers: 'auto',
  sidebarOpen: false,
  firstRun: true, savedTabs: [], searchHistory: [], passwords: [],
  adultMode: false, maxRam: 0, limitGpu: false, limitNetwork: false, limitCpu: false,
  theme: 'dark',
  bookmarks: [], recentlyClosed: [], loadedExtensions: [],
  adBlockEnabled: true,
  proxyEnabled: false, proxyMode: 'none', proxyRegion: 'auto',
  proxyHost: '', proxyPort: '', proxyUsername: '', proxyPassword: '',
  activeDownloads: [],
  browserHistory: [],
});

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), 'utf8');
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch { return defaultSettings(); }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
}

function ensureSearchEngine(settings) {
  if (!searchEngine) { searchEngine = new LumenSearchEngine(app.getPath('userData')); searchEngine.init(); }
  if (settings.lumenSearchEnabled) searchEngine.startCrawler();
  else searchEngine.stopCrawler();
}

function isAdultSite(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (ADULT_DOMAINS.has(host)) return true;
    const full = u.hostname + u.pathname;
    for (const kw of ADULT_KEYWORDS) { if (full.includes(kw)) return true; }
    return false;
  } catch { return false; }
}

function filterNavigation(url) {
  const settings = loadSettings();
  if (settings.adultMode && isAdultSite(url)) return { blocked: true, url };
  return { blocked: false, url };
}

function createWindow() {
  const settings = loadSettings();
  mainWindow = new BrowserWindow({
    width: 1280, height: 840, minWidth: 720, minHeight: 520,
    show: false, frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    backgroundColor: '#07070E',
    icon: process.platform === 'win32'
      ? path.join(__dirname, '../../lumen.ico')
      : path.join(__dirname, '../../lumen_final/assets/icons/lumen_256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      webviewTag: true, sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Custom application menu – remove conflicting shortcuts (Ctrl+F, etc.)
  const appMenuTemplate = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu', submenu: [
      { role: 'quit' }
    ]},
    { role: 'editMenu', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { role: 'selectAll' }
    ]},
    { role: 'viewMenu', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' }
    ]},
    { role: 'windowMenu', submenu: [
      { role: 'minimize' }, { role: 'zoom' }, { role: 'close' }
    ]},
  ];
  const appMenu = Menu.buildFromTemplate(appMenuTemplate);
  Menu.setApplicationMenu(appMenu);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { mainWindow.webContents.send('open-url-new-tab', url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  session.defaultSession.on('will-download', (_event, item) => {
    const downloads = app.getPath('downloads');
    const savePath = path.join(downloads, item.getFilename());
    item.setSavePath(savePath);
    const dlId = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const dlEntry = { id: dlId, name: item.getFilename(), savePath, state: 'started', received: 0, total: item.getTotalBytes(), startTime: Date.now() };
    activeDownloads.unshift(dlEntry);
    if (activeDownloads.length > 50) activeDownloads.length = 50;
    mainWindow?.webContents.send('download-progress', dlEntry);
    item.on('updated', (_e, state) => {
      dlEntry.received = item.getReceivedBytes();
      dlEntry.total = item.getTotalBytes();
      dlEntry.state = state === 'progressing' ? 'progressing' : state;
      mainWindow?.webContents.send('download-progress', { ...dlEntry, received: dlEntry.received, total: dlEntry.total });
    });
    item.once('done', (_e, state) => {
      dlEntry.state = state === 'completed' ? 'done' : 'failed';
      dlEntry.endTime = Date.now();
      mainWindow?.webContents.send('download-progress', { ...dlEntry });
    });
  });

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const result = filterNavigation(details.url);
    if (result.blocked) { mainWindow?.webContents.send('navigation-blocked', result.url); callback({ cancel: true }); return; }
    const settings = loadSettings();
    if (settings.adBlockEnabled) {
      try {
        const u = new URL(details.url);
        const host = u.hostname.replace(/^www\./, '');
        if (AD_BLOCK_DOMAINS.has(host) || details.url.includes('pagead') || details.url.includes('/ad/') || details.url.includes('banner')) {
          callback({ cancel: true }); return;
        }
      } catch {}
    }
    callback({ cancel: false });
  });

  mainWindow.webContents.on('context-menu', (e, props) => {
    const template = [];
    if (props.linkURL) {
      template.push({ label: 'Open Link in New Tab', click: () => mainWindow.webContents.send('open-url-new-tab', props.linkURL) });
      template.push({ label: 'Save Link As...', click: () => mainWindow.webContents.downloadURL(props.linkURL) });
      template.push({ type: 'separator' });
    }
    if (props.mediaType === 'image' && props.srcURL) {
      template.push({ label: 'Save Image As...', click: () => mainWindow.webContents.downloadURL(props.srcURL) });
      template.push({ type: 'separator' });
    }
    template.push(
      { label: 'Back', accelerator: 'Alt+Left', enabled: mainWindow.webContents.canGoBack(), click: () => mainWindow.webContents.goBack() },
      { label: 'Forward', accelerator: 'Alt+Right', enabled: mainWindow.webContents.canGoForward(), click: () => mainWindow.webContents.goForward() },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.webContents.reload() },
      { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => mainWindow.webContents.print({ printBackground: true }) },
      { label: 'Inspect Element', accelerator: 'F12', click: () => mainWindow.webContents.inspectElement(props.x, props.y) },
    );
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
  });

  // Forward keyboard shortcuts from webview focus to renderer
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (!input.control && !input.meta) return;
    const handled = ['t', 'w', 'l', 'f', 'r', 'd', 'h', ',', 'tab', '=', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    if (handled.includes(input.key.toLowerCase())) {
      mainWindow.webContents.send('app-shortcut', { key: input.key, ctrl: input.control, meta: input.meta, shift: input.shift });
    }
  });

  ensureSearchEngine(settings);
}

// ── Auto-updater ───────────────────────────────────────────
function setupAutoUpdater() {
  if (!autoUpdater || !isPackaged) return;
  autoUpdater.setFeedURL({ provider: 'github', owner: 'TheRealWoculus', repo: 'lumen-browser' });
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 3600000);
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', { status: 'available', version: info.version, releaseDate: info.releaseDate });
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-status', { status: 'uptodate' });
  });
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-status', { status: 'downloading', percent: progress.percent, bytesPerSecond: progress.bytesPerSecond });
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', { status: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-status', { status: 'error', message: err.message });
  });
}

// ── Browser Import ─────────────────────────────────────────
const BROWSER_PROFILES = {
  chrome: {
    name: 'Google Chrome', win: '%LOCALAPPDATA%\\Google\\Chrome\\User Data',
    mac: '~/Library/Application Support/Google/Chrome',
    linux: '~/.config/google-chrome', chromium: true,
  },
  brave: {
    name: 'Brave', win: '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data',
    mac: '~/Library/Application Support/BraveSoftware/Brave-Browser',
    linux: '~/.config/BraveSoftware/Brave-Browser', chromium: true,
  },
  vivaldi: {
    name: 'Vivaldi', win: '%LOCALAPPDATA%\\Vivaldi\\User Data',
    mac: '~/Library/Application Support/Vivaldi',
    linux: '~/.config/vivaldi', chromium: true,
  },
  edge: {
    name: 'Microsoft Edge', win: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data',
    mac: '~/Library/Application Support/Microsoft Edge',
    linux: '~/.config/microsoft-edge', chromium: true,
  },
  opera: {
    name: 'Opera', win: '%APPDATA%\\Opera Software\\Opera Stable',
    mac: '~/Library/Application Support/com.operasoftware.Opera',
    linux: '~/.config/opera', chromium: true,
  },
  arc: {
    name: 'Arc', win: '%LOCALAPPDATA%\\Arc\\User Data',
    mac: '~/Library/Application Support/Arc',
    linux: '~/.config/arc', chromium: true,
  },
  firefox: {
    name: 'Firefox', win: '%APPDATA%\\Mozilla\\Firefox\\Profiles',
    mac: '~/Library/Application Support/Firefox/Profiles',
    linux: '~/.mozilla/firefox', chromium: false,
  },
  'zen-browser': {
    name: 'Zen Browser', win: '%APPDATA%\\zen\\Profiles',
    mac: '~/Library/Application Support/zen/Profiles',
    linux: '~/.zen', chromium: false,
  },
};

function expandPath(p) {
  let out = p.replace(/%LOCALAPPDATA%/g, process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'));
  out = out.replace(/%APPDATA%/g, process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'));
  out = out.replace(/^~/, os.homedir());
  return out;
}

function getBrowserProfiles() {
  const results = [];
  for (const [key, cfg] of Object.entries(BROWSER_PROFILES)) {
    try {
      const platformKey = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
      const baseDir = expandPath(cfg[platformKey]);
      if (!fs.existsSync(baseDir)) continue;
      if (cfg.chromium) {
        if (fs.existsSync(path.join(baseDir, 'Default', 'Bookmarks'))) {
          results.push({ id: key, name: cfg.name, profilePath: path.join(baseDir, 'Default') });
        }
      } else {
        const dirs = fs.readdirSync(baseDir).filter((d) => d.endsWith('.default-release') || d.endsWith('.default'));
        for (const d of dirs) {
          const pp = path.join(baseDir, d);
          if (fs.existsSync(path.join(pp, 'places.sqlite'))) {
            results.push({ id: key, name: cfg.name, profilePath: pp });
            break;
          }
        }
      }
    } catch {}
  }
  return results;
}

function importChromiumBookmarks(profilePath) {
  try {
    const bmFile = path.join(profilePath, 'Bookmarks');
    if (!fs.existsSync(bmFile)) return [];
    const raw = JSON.parse(fs.readFileSync(bmFile, 'utf8'));
    const entries = [];
    function walk(node) {
      if (node.url && (node.url.startsWith('http:') || node.url.startsWith('https:'))) {
        entries.push({ url: node.url, title: (node.name || '').trim(), time: node.date_added ? Math.floor(parseInt(node.date_added) / 1000000) : Date.now() });
      }
      if (node.children) node.children.forEach(walk);
    }
    if (raw.roots) Object.values(raw.roots).forEach(walk);
    return entries;
  } catch { return []; }
}

function importChromiumHistory(profilePath) {
  try {
    const db = new (require('better-sqlite3'))(path.join(profilePath, 'History'), { readonly: true, fileMustExist: true });
    const rows = db.prepare('SELECT url, title, last_visit_time FROM urls WHERE url LIKE "http%" ORDER BY last_visit_time DESC LIMIT 1000').all();
    db.close();
    return rows.map((r) => ({ url: r.url, title: (r.title || '').trim(), time: Math.floor(r.last_visit_time / 1000000 - 11644473600) }));
  } catch { return []; }
}

function importFirefoxPlaces(profilePath) {
  const bookmarks = [];
  const history = [];
  try {
    const db = new (require('better-sqlite3'))(path.join(profilePath, 'places.sqlite'), { readonly: true, fileMustExist: true });
    const bmRows = db.prepare(`
      SELECT b.title, p.url, b.dateAdded FROM moz_bookmarks b
      JOIN moz_places p ON b.fk = p.id
      WHERE p.url LIKE "http%" AND b.type = 1
      ORDER BY b.dateAdded DESC LIMIT 2000
    `).all();
    for (const r of bmRows) {
      if (r.url && (r.url.startsWith('http:') || r.url.startsWith('https:'))) {
        bookmarks.push({ url: r.url, title: (r.title || '').trim(), time: Math.floor(r.dateAdded / 1000) });
      }
    }
    const histRows = db.prepare(`
      SELECT url, title, visit_date FROM moz_places
      WHERE url LIKE "http%" ORDER BY last_visit_date DESC LIMIT 1000
    `).all();
    for (const r of histRows) {
      history.push({ url: r.url, title: (r.title || '').trim(), time: Math.floor((r.visit_date || 0) / 1000) });
    }
    db.close();
  } catch {}
  return { bookmarks, history };
}

// ── Auto-updater IPC ───────────────────────────────────────
ipcMain.handle('check-for-updates', () => {
  if (autoUpdater && isPackaged) { autoUpdater.checkForUpdates(); return { checking: true }; }
  return { checking: false, error: 'Not available in dev mode' };
});
ipcMain.handle('restart-and-update', () => {
  if (autoUpdater && isPackaged) { autoUpdater.quitAndInstall(); }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { searchEngine?.close(); if (!isMac) app.quit(); });

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('set-settings', (_e, partial) => {
  const next = { ...loadSettings(), ...partial };
  if (partial.firstRun === false) { const saved = { ...loadSettings() }; saved.savedTabs = []; saveSettings(saved); }
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
  saveSettings(next); ensureSearchEngine(next); return next;
});
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('pick-wallpaper', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] });
  if (canceled || !filePaths[0]) return null;
  return `file://${filePaths[0]}`;
});
ipcMain.handle('pick-local-model', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Local models', extensions: ['gguf', 'bin'] }, { name: 'All files', extensions: ['*'] }] });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});
ipcMain.handle('load-local-model', async (_e, { modelPath, contextSize, gpuLayers }) => {
  const settings = loadSettings();
  const pathToLoad = modelPath || settings.localModelPath;
  if (!pathToLoad) throw new Error('No model path selected');
  const result = await localAi.loadModel(pathToLoad, { contextSize: contextSize ?? settings.localContextSize ?? 4096, gpuLayers: gpuLayers ?? settings.localGpuLayers ?? 'auto' });
  const next = { ...settings, localModelPath: pathToLoad, aiProvider: 'local' };
  saveSettings(next);
  mainWindow?.webContents.send('local-ai-status', localAi.status());
  return result;
});
ipcMain.handle('unload-local-model', async () => { await localAi.unloadModel(); mainWindow?.webContents.send('local-ai-status', localAi.status()); return { ok: true }; });
ipcMain.handle('local-ai-status', () => localAi.status());
ipcMain.handle('ai-chat', async (_e, payload) => {
  const { messages, apiKey, provider } = payload;
  const settings = loadSettings();
  const mode = provider || settings.aiProvider || 'anthropic';
  if (mode === 'local') {
    try {
      if (!localAi.status().loaded && settings.localModelPath) await localAi.loadModel(settings.localModelPath, { contextSize: settings.localContextSize ?? 4096, gpuLayers: settings.localGpuLayers ?? 'auto' });
      const text = await localAi.chat(messages, { maxTokens: payload.maxTokens ?? 512, temperature: payload.temperature ?? 0.7 });
      return { role: 'assistant', content: text };
    } catch (err) { return { role: 'assistant', content: `Local AI: ${err.message}. Load a .gguf or .bin file in Settings -> AI Assistant.` }; }
  }
  const key = apiKey || settings.aiApiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return { role: 'assistant', content: 'Use cloud Claude (add API key) or switch to Local model and load a .gguf / .bin file in Settings -> AI Assistant.' };
  const body = { model: 'claude-sonnet-4-20250514', max_tokens: 1024, messages: messages.map((m) => ({ role: m.role, content: m.content })) };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    if (!res.ok) { const err = await res.text(); throw new Error(err.slice(0, 200)); }
    const data = await res.json();
    const text = data.content?.find((c) => c.type === 'text')?.text ?? 'No response.';
    return { role: 'assistant', content: text };
  } catch (err) { return { role: 'assistant', content: `AI request failed: ${err.message}. Check your API key and network.` }; }
});
ipcMain.handle('resolve-path', (_e, relativePath) => { const base = path.join(__dirname, '../..'); return path.join(base, relativePath); });
ipcMain.handle('get-guest-preload-path', () => path.join(__dirname, 'guest-preload.js'));
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('check-adult', (_e, url) => isAdultSite(url));
ipcMain.handle('save-tabs', (_e, tabs) => { const s = loadSettings(); s.savedTabs = tabs.slice(0, 50); saveSettings(s); return true; });
ipcMain.handle('load-tabs', () => { const s = loadSettings(); return s.savedTabs || []; });
ipcMain.handle('add-history', (_e, entry) => { const s = loadSettings(); const h = s.searchHistory || []; h.unshift({ ...entry, time: Date.now() }); if (h.length > 500) h.length = 500; s.searchHistory = h; saveSettings(s); return true; });
ipcMain.handle('get-history', () => { const s = loadSettings(); return s.searchHistory || []; });
ipcMain.handle('clear-history', () => { const s = loadSettings(); s.searchHistory = []; saveSettings(s); return true; });
ipcMain.handle('get-passwords', () => { const s = loadSettings(); return s.passwords || []; });
ipcMain.handle('save-password', (_e, entry) => { const s = loadSettings(); const p = s.passwords || []; const idx = p.findIndex((pw) => pw.url === entry.url && pw.username === entry.username); if (idx >= 0) p[idx] = entry; else p.push(entry); s.passwords = p; saveSettings(s); return true; });
ipcMain.handle('delete-password', (_e, url, username) => { const s = loadSettings(); s.passwords = (s.passwords || []).filter((p) => !(p.url === url && p.username === username)); saveSettings(s); return true; });
ipcMain.handle('get-welcome-path', () => `file://${path.join(__dirname, '../renderer/welcome.html')}`);

ipcMain.handle('add-bookmark', (_e, entry) => {
  const s = loadSettings(); const b = s.bookmarks || [];
  if (!b.find((bm) => bm.url === entry.url)) { b.unshift({ ...entry, time: Date.now() }); s.bookmarks = b; saveSettings(s); }
  return true;
});
ipcMain.handle('remove-bookmark', (_e, url) => {
  const s = loadSettings(); s.bookmarks = (s.bookmarks || []).filter((bm) => bm.url !== url); saveSettings(s); return true;
});
ipcMain.handle('get-bookmarks', () => { const s = loadSettings(); return s.bookmarks || []; });
ipcMain.handle('check-bookmark', (_e, url) => { const s = loadSettings(); return !!(s.bookmarks || []).find((bm) => bm.url === url); });

ipcMain.handle('load-extension', async (_e, extPath) => {
  try {
    const ext = await session.defaultSession.loadExtension(extPath);
    const s = loadSettings(); const loaded = s.loadedExtensions || [];
    if (!loaded.find((lx) => lx.id === ext.id)) loaded.push({ id: ext.id, name: ext.name, version: ext.version, path: extPath });
    s.loadedExtensions = loaded; saveSettings(s);
    return { success: true, id: ext.id, name: ext.name };
  } catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('remove-extension', (_e, id) => {
  session.defaultSession.removeExtension(id);
  const s = loadSettings(); s.loadedExtensions = (s.loadedExtensions || []).filter((lx) => lx.id !== id); saveSettings(s);
  return true;
});
ipcMain.handle('get-extensions', () => {
  const s = loadSettings();
  return (s.loadedExtensions || []).map((e) => ({ id: e.id, name: e.name, version: e.version }));
});

ipcMain.handle('pick-extension-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle('get-downloads', () => activeDownloads);

ipcMain.handle('clear-downloads', () => {
  activeDownloads = [];
  return true;
});

ipcMain.handle('clear-browsing-data', async (_e, opts = {}) => {
  const { cache = true, cookies = true, history = true, downloads = true } = opts;
  try {
    if (cache) {
      const ses = session.defaultSession;
      await ses.clearCache();
      await ses.clearCodeCaches();
    }
    if (cookies) {
      await session.defaultSession.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'cachestorage', 'shadercache'] });
    }
    if (history) {
      const s = loadSettings();
      s.browserHistory = [];
      s.searchHistory = [];
      saveSettings(s);
    }
    if (downloads) {
      activeDownloads = [];
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('set-proxy', async (_e, config) => {
  const { enabled, mode, host, port, username, password } = config;
  const s = loadSettings();
  if (!enabled) {
    s.proxyEnabled = false;
    saveSettings(s);
    await session.defaultSession.setProxy({ proxyRules: 'direct://' });
    mainWindow?.webContents.reload();
    return { success: true };
  }
  s.proxyEnabled = true;
  s.proxyMode = mode || 'socks5';
  s.proxyHost = host || '';
  s.proxyPort = port || '';
  s.proxyUsername = username || '';
  s.proxyPassword = password || '';
  saveSettings(s);
  const proxyString = `${mode || 'socks5'}://${host}:${port}`;
  await session.defaultSession.setProxy({ proxyRules: proxyString });
  mainWindow?.webContents.reload();
  return { success: true };
});

ipcMain.handle('get-proxy', () => {
  const s = loadSettings();
  return { enabled: s.proxyEnabled, mode: s.proxyMode, host: s.proxyHost, port: s.proxyPort, username: s.proxyUsername, password: s.proxyPassword };
});

ipcMain.handle('import-bookmarks', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Bookmarks HTML', extensions: ['html', 'htm'] }]
  });
  if (canceled || !filePaths[0]) return { success: false };
  try {
    const html = fs.readFileSync(filePaths[0], 'utf8');
    const bookmarkRegex = /<A HREF="([^"]*)"[^>]*>(.*?)<\/A>/gi;
    const imported = [];
    let match;
    while ((match = bookmarkRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      if (url && title && (url.startsWith('http:') || url.startsWith('https:'))) {
        imported.push({ url, title, time: Date.now() });
      }
    }
    if (imported.length === 0) return { success: false, error: 'No bookmarks found in file' };
    const s = loadSettings();
    const existingUrls = new Set((s.bookmarks || []).map((b) => b.url));
    for (const bm of imported) {
      if (!existingUrls.has(bm.url)) {
        s.bookmarks.push(bm);
        existingUrls.add(bm.url);
      }
    }
    saveSettings(s);
    return { success: true, count: imported.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-bookmarks', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'bookmarks.html',
    filters: [{ name: 'Bookmarks HTML', extensions: ['html'] }]
  });
  if (canceled || !filePath) return { success: false };
  try {
    const s = loadSettings();
    const bookmarks = s.bookmarks || [];
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8"><TITLE>Bookmarks</TITLE><H1>Bookmarks</H1><DL><p>\n`;
    for (const bm of bookmarks) {
      html += `  <DT><A HREF="${bm.url}" ADD_DATE="${Math.floor(bm.time / 1000)}">${bm.title}</A>\n`;
    }
    html += `</DL><p>\n`;
    fs.writeFileSync(filePath, html, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('add-browser-history', (_e, entry) => {
  const s = loadSettings();
  const bh = s.browserHistory || [];
  bh.unshift({ ...entry, time: Date.now() });
  if (bh.length > 1000) bh.length = 1000;
  s.browserHistory = bh;
  saveSettings(s);
  return true;
});

ipcMain.handle('get-browser-history', () => {
  const s = loadSettings();
  return (s.browserHistory || []).slice(0, 200);
});

ipcMain.handle('clear-browser-history', () => {
  const s = loadSettings();
  s.browserHistory = [];
  saveSettings(s);
  return true;
});

ipcMain.handle('download-file', (_e, url) => {
  mainWindow?.webContents.downloadURL(url);
  return true;
});

// ── Browser import IPC ─────────────────────────────────────
ipcMain.handle('detect-browsers', () => getBrowserProfiles());

ipcMain.handle('import-browser-data', (_e, browserId, profilePath, opts = {}) => {
  const { bookmarks: importBookmarks = true, history: importHistory = true } = opts;
  const cfg = BROWSER_PROFILES[browserId];
  if (!cfg) return { success: false, error: 'Unknown browser' };
  let importedBookmarks = [];
  let importedHistory = [];
  if (cfg.chromium) {
    if (importBookmarks) importedBookmarks = importChromiumBookmarks(profilePath);
    if (importHistory) importedHistory = importChromiumHistory(profilePath);
  } else {
    const data = importFirefoxPlaces(profilePath);
    if (importBookmarks) importedBookmarks = data.bookmarks;
    if (importHistory) importedHistory = data.history;
  }
  const s = loadSettings();
  const result = { bookmarks: 0, history: 0 };
  if (importedBookmarks.length > 0) {
    const existingUrls = new Set((s.bookmarks || []).map((b) => b.url));
    for (const bm of importedBookmarks) {
      if (!existingUrls.has(bm.url)) { s.bookmarks.push(bm); existingUrls.add(bm.url); result.bookmarks++; }
    }
  }
  if (importedHistory.length > 0) {
    const existingUrls = new Set((s.browserHistory || []).slice(0, 500).map((h) => h.url));
    let added = 0;
    for (const h of importedHistory) {
      if (!existingUrls.has(h.url) && added < 500) { s.browserHistory.push(h); existingUrls.add(h.url); result.history++; added++; }
    }
    if (s.browserHistory.length > 1000) s.browserHistory.length = 1000;
  }
  saveSettings(s);
  return { success: true, ...result };
});

// ── Auto-updater setup after window ────────────────────────
setTimeout(setupAutoUpdater, 3000);

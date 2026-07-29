const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lumen', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial) => ipcRenderer.invoke('set-settings', partial),
  lumenSearch: (query) => ipcRenderer.invoke('lumen-search', query),
  lumenSearchStats: () => ipcRenderer.invoke('lumen-search-stats'),
  toggleLumenSearch: (enabled) => ipcRenderer.invoke('toggle-lumen-search', enabled),
  pickWallpaper: () => ipcRenderer.invoke('pick-wallpaper'),
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload),
  pickLocalModel: () => ipcRenderer.invoke('pick-local-model'),
  loadLocalModel: (opts) => ipcRenderer.invoke('load-local-model', opts || {}),
  unloadLocalModel: () => ipcRenderer.invoke('unload-local-model'),
  localAiStatus: () => ipcRenderer.invoke('local-ai-status'),
  onLocalAiStatus: (cb) => {
    ipcRenderer.on('local-ai-status', (_e, data) => cb(data));
  },
  resolvePath: (p) => ipcRenderer.invoke('resolve-path', p),
  getGuestPreloadPath: () => ipcRenderer.invoke('get-guest-preload-path'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onOpenUrlNewTab: (cb) => {
    ipcRenderer.on('open-url-new-tab', (_e, url) => cb(url));
  },
  onDownloadProgress: (cb) => {
    ipcRenderer.on('download-progress', (_e, data) => cb(data));
  },
});

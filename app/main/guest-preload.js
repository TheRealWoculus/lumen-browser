const { ipcRenderer } = require('electron');

window.lumenGuest = {
  navigate(query) {
    ipcRenderer.sendToHost('lumen-navigate', query);
  },
  async getBookmarks() {
    return ipcRenderer.invoke('get-bookmarks');
  },
};

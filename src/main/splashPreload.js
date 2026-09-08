'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashApi', {
  onStatus(callback) {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('splash-status', handler);
    return () => ipcRenderer.removeListener('splash-status', handler);
  },
  getIconDataUrl() {
    return ipcRenderer.invoke('get-splash-icon');
  },
});

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('splashApi', {
  onStatus: (callback: (payload: { text?: string; progress?: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { text?: string; progress?: number }) => {
      callback(payload);
    };
    ipcRenderer.on('splash-status', handler);
    return () => ipcRenderer.removeListener('splash-status', handler);
  },
  getIconDataUrl: () => ipcRenderer.invoke('get-splash-icon') as Promise<string | null>,
});

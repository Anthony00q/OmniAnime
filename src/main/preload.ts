import { contextBridge, ipcRenderer } from 'electron';

const INVOKE_CHANNELS = new Set([
  'get-preloaded-data',
  'get-providers',
  'get-active-provider',
  'set-active-provider',
  'get-connectivity-status',
  'get-download-history',
  'clear-download-history',
  'remove-history-entry',
  'remove-history-entries',
  'open-folder',
  'window-minimize',
  'window-toggle-maximize',
  'window-close',
  'force-close-app',
  'window-get-state',
  'open-external-url',
  'app-restart',
  'add-to-queue',
  'cancel-download',
  'pause-download',
  'cancel-episode',
  'pause-episode',
  'resume-episode',
  'skip-episode',
  'skip-server',
  'clear-queue',
  'remove-from-queue',
  'resume-download',
  'retry-failed-download',
  'open-anime-folder',
  'get-queue',
  'get-settings',
  'get-default-settings',
  'save-settings',
  'get-image-base64',
  'get-home-data',
  'get-catalog',
  'get-filters-data',
  'search-anime',
  'get-details',
  'get-episode-thumbs',
  'select-folder',
  'search-trailer-id',
  'rename-anime-files',
  'preview-rename-anime-files',
  'preview-reorder-episodes',
  'scan-downloads',
  'rename-folder',
  'delete-folder',
  'relink-folder',
  'scan-episodes',
  'play-video',
  'delete-video',
  'get-folders-for-reorder',
  'reorder-episodes',
  'get-video-thumbnail',
  'app-update-check',
  'app-update-download',
  'app-update-install',
  'get-app-version',
  'get-splash-icon',
  'get-storage-stats',
  'get-server-stats',
  'clean-cache',
  'clean-thumbnails',
  'get-app-paths',
  'open-app-path',
  'export-settings',
  'import-settings',
  'get-system-info',
  'renderer-ready',
]);

const EVENT_CHANNELS = new Set([
  'app-ready',
  'confirm-app-close',
  'window-state-changed',
  'queue-update',
  'queue-progress',
  'history-updated',
  'download-started',
  'episode-downloaded',
  'app-update-status',
  'dl-log',
  'dl-status',
  'dl-log-progress',
]);

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: any[]) => {
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error(`Canal IPC no permitido: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    if (!EVENT_CHANNELS.has(channel)) return;
    const subscription = (_event: any, ...args: any[]) => func(...args);
    (func as any).__subscription = subscription;
    ipcRenderer.on(channel, subscription);
  },
  removeListener: (channel: string, func: (...args: any[]) => void) => {
    if (!EVENT_CHANNELS.has(channel)) return;
    const subscription = (func as any).__subscription;
    if (subscription) {
      ipcRenderer.removeListener(channel, subscription);
    } else {
      ipcRenderer.removeListener(channel, func);
    }
  },
  removeAllListeners: (channel: string) => {
    if (!EVENT_CHANNELS.has(channel)) return;
    ipcRenderer.removeAllListeners(channel);
  },
});

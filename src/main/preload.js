'use strict';
// GENERADO por scripts/generate-preload.mjs desde src/main/preload.ts — no editar a mano.

const __modules = {
  'main/preload': function (exports, require, module) {
    'use strict';
    Object.defineProperty(exports, '__esModule', { value: true });
    const electron_1 = require('electron');
    const ipc_channels_1 = require('../types/ipc-channels');
    const invokeAllowed = new Set(ipc_channels_1.INVOKE_CHANNELS);
    const sendAllowed = new Set(ipc_channels_1.SEND_CHANNELS);
    const eventAllowed = new Set(ipc_channels_1.EVENT_CHANNELS);
    electron_1.contextBridge.exposeInMainWorld('api', {
      invoke: (channel, ...args) => {
        if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`Canal IPC no permitido: ${channel}`));
        return electron_1.ipcRenderer.invoke(channel, ...args);
      },
      send: (channel, ...args) => {
        if (!sendAllowed.has(channel)) return;
        electron_1.ipcRenderer.send(channel, ...args);
      },
      on: (channel, func) => {
        if (!eventAllowed.has(channel)) return;
        const subscription = (_event, ...args) => func(...args);
        func.__subscription = subscription;
        electron_1.ipcRenderer.on(channel, subscription);
      },
      removeListener: (channel, func) => {
        if (!eventAllowed.has(channel)) return;
        const subscription = func.__subscription;
        if (subscription) {
          electron_1.ipcRenderer.removeListener(channel, subscription);
        } else {
          electron_1.ipcRenderer.removeListener(channel, func);
        }
      },
      removeAllListeners: (channel) => {
        if (!eventAllowed.has(channel)) return;
        electron_1.ipcRenderer.removeAllListeners(channel);
      },
    });
  },
  'types/ipc-channels': function (exports, require, module) {
    'use strict';
    // Fuente única de canales IPC: preloads, globals.d.ts y registro de handlers salen de aquí.
    // Los .js de los preloads los genera scripts/generate-preload.mjs; no se editan a mano.
    Object.defineProperty(exports, '__esModule', { value: true });
    exports.SPLASH_EVENT_CHANNELS = exports.EVENT_CHANNELS = exports.SEND_CHANNELS = exports.INVOKE_CHANNELS = void 0;
    // invoke: renderer -> main (ipcMain.handle)
    exports.INVOKE_CHANNELS = [
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
      'get-schedule',
      'get-catalog',
      'get-filters-data',
      'search-anime',
      'get-details',
      'get-episode-thumbs',
      'get-anilist-banner',
      'search-anilist',
      'set-anilist-link',
      'remove-anilist-link',
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
      'import-custom-sound',
      'delete-custom-sound',
      'read-sound-data',
      'get-system-info',
      'get-log-page',
      'get-log-filenames',
      'delete-log-files',
      'export-diagnostics',
      'delete-log-entries',
      'renderer-ready',
    ];
    // send: renderer -> main (ipcMain.on). Solo log-error.
    exports.SEND_CHANNELS = ['log-error'];
    // evento: main -> renderer (webContents.send / api.on)
    exports.EVENT_CHANNELS = [
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
    ];
    // eventos del splash: viven solo en splashPreload, fuera del preload principal
    exports.SPLASH_EVENT_CHANNELS = ['splash-status'];
  },
};

const __cache = {};
function __resolve(from, id) {
  const joined = [...from.split('/').slice(0, -1), ...id.split('/')];
  const parts = [];
  for (const part of joined) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}
function __load(key) {
  const factory = __modules[key];
  if (!factory) throw new Error('Módulo no incluido en el preload: ' + key);
  if (!__cache[key]) {
    const mod = { exports: {} };
    factory(mod.exports, (next) => __require(next, key), mod);
    __cache[key] = mod.exports;
  }
  return __cache[key];
}
function __require(id, from) {
  if (!id.startsWith('.')) return require(id);
  return __load(__resolve(from, id));
}

__load('main/preload');

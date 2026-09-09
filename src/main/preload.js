'use strict';
var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from));
  };
Object.defineProperty(exports, '__esModule', { value: true });
var electron_1 = require('electron');
var INVOKE_CHANNELS = new Set([
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
  'update-ytdlp',
  'get-ytdlp-version',
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
var EVENT_CHANNELS = new Set([
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
electron_1.contextBridge.exposeInMainWorld('api', {
  invoke: function (channel) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error('Canal IPC no permitido: ' + channel));
    return electron_1.ipcRenderer.invoke.apply(electron_1.ipcRenderer, __spreadArray([channel], args, false));
  },
  on: function (channel, func) {
    if (!EVENT_CHANNELS.has(channel)) return;
    var subscription = function () {
      var args = [];
      for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
      }
      return func.apply(void 0, args);
    };
    func.__subscription = subscription;
    electron_1.ipcRenderer.on(channel, subscription);
  },
  removeListener: function (channel, func) {
    if (!EVENT_CHANNELS.has(channel)) return;
    var subscription = func.__subscription;
    if (subscription) {
      electron_1.ipcRenderer.removeListener(channel, subscription);
    } else {
      electron_1.ipcRenderer.removeListener(channel, func);
    }
  },
  removeAllListeners: function (channel) {
    if (!EVENT_CHANNELS.has(channel)) return;
    electron_1.ipcRenderer.removeAllListeners(channel);
  },
});

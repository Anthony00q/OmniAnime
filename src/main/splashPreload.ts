import { contextBridge, ipcRenderer } from 'electron';
import {
  INVOKE_CHANNELS,
  SPLASH_EVENT_CHANNELS,
  type InvokeChannel,
  type SplashEventChannel,
} from '../types/ipc-channels';
import { isIpcFail, type IpcResponse } from '../types/api';

// Preload aislado del splash; sus canales salen de la fuente única.
const splashStatus: SplashEventChannel = 'splash-status';
const splashIcon: InvokeChannel = 'get-splash-icon';
const invokeAllowed = new Set<string>(INVOKE_CHANNELS);
const splashEventAllowed = new Set<string>(SPLASH_EVENT_CHANNELS);

contextBridge.exposeInMainWorld('splashApi', {
  onStatus: (callback: (payload: { text?: string; progress?: number }) => void) => {
    if (!splashEventAllowed.has(splashStatus)) return () => {};
    const handler = (_event: Electron.IpcRendererEvent, payload: { text?: string; progress?: number }) => {
      callback(payload);
    };
    ipcRenderer.on(splashStatus, handler);
    return () => ipcRenderer.removeListener(splashStatus, handler);
  },
  getIconDataUrl: (): Promise<string | null> => {
    if (!invokeAllowed.has(splashIcon)) return Promise.reject(new Error(`Canal IPC no permitido: ${splashIcon}`));
    return (ipcRenderer.invoke(splashIcon) as Promise<IpcResponse<string | null>>).then((res) =>
      res && !isIpcFail(res) ? (res.data ?? null) : null,
    );
  },
});

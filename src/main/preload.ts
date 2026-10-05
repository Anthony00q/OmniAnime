import { contextBridge, ipcRenderer } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS } from '../types/ipc-channels';

const invokeAllowed = new Set<string>(INVOKE_CHANNELS);
const sendAllowed = new Set<string>(SEND_CHANNELS);
const eventAllowed = new Set<string>(EVENT_CHANNELS);

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: any[]) => {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`Canal IPC no permitido: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  send: (channel: string, ...args: any[]) => {
    if (!sendAllowed.has(channel)) return;
    ipcRenderer.send(channel, ...args);
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    if (!eventAllowed.has(channel)) return;
    const subscription = (_event: any, ...args: any[]) => func(...args);
    (func as any).__subscription = subscription;
    ipcRenderer.on(channel, subscription);
  },
  removeListener: (channel: string, func: (...args: any[]) => void) => {
    if (!eventAllowed.has(channel)) return;
    const subscription = (func as any).__subscription;
    if (subscription) {
      ipcRenderer.removeListener(channel, subscription);
    } else {
      ipcRenderer.removeListener(channel, func);
    }
  },
  removeAllListeners: (channel: string) => {
    if (!eventAllowed.has(channel)) return;
    ipcRenderer.removeAllListeners(channel);
  },
});

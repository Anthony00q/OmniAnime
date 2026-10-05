/// <reference types="vite/client" />

// Un canal fuera de la fuente única no compila en el renderer.
import type { EventChannel, InvokeChannel, SendChannel } from '@/types/ipc-channels';

export interface IElectronAPI {
  invoke: (channel: InvokeChannel, ...args: any[]) => Promise<any>;
  send: (channel: SendChannel, ...args: any[]) => void;
  on: (channel: EventChannel, func: (...args: any[]) => void) => void;
  removeListener: (channel: EventChannel, func: (...args: any[]) => void) => void;
  removeAllListeners: (channel: EventChannel) => void;
}

export interface ISplashAPI {
  onStatus: (callback: (payload: { text?: string; progress?: number }) => void) => () => void;
  getIconDataUrl: () => Promise<string | null>;
}

declare global {
  interface Window {
    api: IElectronAPI;
    splashApi?: ISplashAPI;
  }
}

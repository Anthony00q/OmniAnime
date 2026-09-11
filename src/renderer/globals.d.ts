/// <reference types="vite/client" />

export interface IElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, func: (...args: any[]) => void) => void;
  removeListener: (channel: string, func: (...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
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

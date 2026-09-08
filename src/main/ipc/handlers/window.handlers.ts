import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { isAllowedExternalUrl } from '../../../utils/externalUrl';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerWindowHandlers({ getMainWindow, setIsQuitting }: IpcRegistryDependencies): void {
  ipcMain.handle('get-app-version', () => {
    try {
      return app.getVersion();
    } catch {
      return null;
    }
  });

  ipcMain.handle('get-splash-icon', () => {
    try {
      const iconPath = path.join(app.getAppPath(), 'assets', 'icon-64.png');
      if (!fs.existsSync(iconPath)) return null;
      const data = fs.readFileSync(iconPath);
      return `data:image/png;base64,${data.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('window-minimize', () => {
    try {
      getMainWindow()?.minimize();
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('window-toggle-maximize', () => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) return { isMaximized: false };
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      return { isMaximized: mainWindow.isMaximized() };
    } catch {
      return { isMaximized: false };
    }
  });

  ipcMain.handle('window-close', () => {
    try {
      getMainWindow()?.close();
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('force-close-app', () => {
    try {
      setIsQuitting(true);
      getMainWindow()?.close();
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('window-get-state', () => {
    try {
      return { isMaximized: !!getMainWindow()?.isMaximized() };
    } catch {
      return { isMaximized: false };
    }
  });

  ipcMain.handle('open-external-url', async (_, rawUrl: string) => {
    try {
      const url = String(rawUrl || '').trim();
      if (!isAllowedExternalUrl(url)) return false;
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('app-restart', () => {
    try {
      setIsQuitting(true);
    } catch {}
    // Marcador para que la nueva instancia espere al candado single-instance
    // en vez de cerrarse si la anterior aún está saliendo.
    const marker = '--omnianime-restart';
    const args = process.argv.slice(1).includes(marker) ? process.argv.slice(1) : [...process.argv.slice(1), marker];
    app.relaunch({ args });
    app.quit();
  });
}

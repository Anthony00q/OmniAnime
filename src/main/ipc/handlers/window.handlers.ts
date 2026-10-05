import { app, shell } from 'electron';
import { handleIpc } from '../ipcGuard';
import * as fs from 'fs';
import * as path from 'path';
import { fail, ok } from '../../../types/api';
import { isAllowedChangelogUrl, isAllowedExternalUrl } from '../../../utils/security/externalUrl';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerWindowHandlers({ getMainWindow, setIsQuitting }: IpcRegistryDependencies): void {
  handleIpc('get-app-version', () => {
    try {
      return ok(app.getVersion());
    } catch {
      return ok(null);
    }
  });

  handleIpc('get-splash-icon', () => {
    try {
      const iconPath = path.join(app.getAppPath(), 'assets', 'icon-64.png');
      if (!fs.existsSync(iconPath)) return ok(null);
      const data = fs.readFileSync(iconPath);
      return ok(`data:image/png;base64,${data.toString('base64')}`);
    } catch {
      return ok(null);
    }
  });

  handleIpc('window-minimize', () => {
    try {
      getMainWindow()?.minimize();
      return ok(null);
    } catch {
      return fail('WINDOW_MINIMIZE_FAILED', 'No se pudo minimizar la ventana');
    }
  });

  handleIpc('window-toggle-maximize', () => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) return ok({ isMaximized: false });
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      return ok({ isMaximized: mainWindow.isMaximized() });
    } catch {
      return ok({ isMaximized: false });
    }
  });

  handleIpc('window-close', () => {
    try {
      getMainWindow()?.close();
      return ok(null);
    } catch {
      return fail('WINDOW_CLOSE_FAILED', 'No se pudo cerrar la ventana');
    }
  });

  handleIpc('force-close-app', () => {
    try {
      setIsQuitting(true);
      getMainWindow()?.close();
      return ok(null);
    } catch {
      return fail('WINDOW_CLOSE_FAILED', 'No se pudo cerrar la ventana');
    }
  });

  handleIpc('window-get-state', () => {
    try {
      return ok({ isMaximized: !!getMainWindow()?.isMaximized() });
    } catch {
      return ok({ isMaximized: false });
    }
  });

  // `policy` elige la allowlist: proveedores por defecto, changelog para las notas.
  handleIpc('open-external-url', async (_, rawUrl: string, options?: { policy?: 'provider' | 'changelog' }) => {
    try {
      const url = String(rawUrl || '').trim();
      const allowed = options?.policy === 'changelog' ? isAllowedChangelogUrl(url) : isAllowedExternalUrl(url);
      if (!allowed) return fail('OPEN_EXTERNAL_URL_FAILED', 'No se pudo abrir el enlace externo');
      await shell.openExternal(url);
      return ok(null);
    } catch {
      return fail('OPEN_EXTERNAL_URL_FAILED', 'No se pudo abrir el enlace externo');
    }
  });

  handleIpc('app-restart', () => {
    try {
      setIsQuitting(true);
    } catch {}
    // Marcador para que la nueva instancia espere al candado single-instance
    // en vez de cerrarse si la anterior aún está saliendo.
    const marker = '--omnianime-restart';
    const args = process.argv.slice(1).includes(marker) ? process.argv.slice(1) : [...process.argv.slice(1), marker];
    app.relaunch({ args });
    app.quit();
    return ok(null);
  });
}

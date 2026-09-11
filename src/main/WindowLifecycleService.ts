import { app, BrowserWindow, Menu, session, Tray } from 'electron';
import * as fs from 'fs';
import type { AppSettings } from '../types/settings';
import { noopScopedLogger, type ScopedLogger } from '../services/AppLogger';
import { applyYouTubeEmbedIdentityHeaders, resolveWindowCloseAction } from '../utils/windowUtils';
import {
  buildToolsStatusText,
  clampSplashProgress,
  waitForRendererReady,
  withStartupTimeout,
  RENDERER_READY_TIMEOUT_MS,
  SPLASH_BOOT_TIMEOUT_MS,
  SPLASH_STATUS_BUFFER_LIMIT,
} from '../utils/splashBoot';

export interface PreloadedData {
  providerId: string;
  home: unknown;
  filters: unknown;
  catalog: unknown;
  libraryMeta: unknown;
}

export {
  RENDERER_READY_TIMEOUT_MS,
  SPLASH_BOOT_TIMEOUT_MS,
  SPLASH_STATUS_BUFFER_LIMIT,
  clampSplashProgress,
  waitForRendererReady,
  withStartupTimeout,
  buildToolsStatusText,
};

export interface WindowLifecycleDependencies {
  getAppHtmlPath: () => string;
  getAppIconPath: () => string;
  getSplashHtmlPath: () => string;
  getSplashPreloadPath: () => string;
  getPreloadPath: () => string;
  getDevServerUrl: () => string;
  isPackaged: () => boolean;
  getSettings: () => AppSettings;
  initializeDatabase: () => Promise<void>;
  setActiveProvider: (providerId: string) => void;
  getActiveProviderId: () => string;
  checkTools?: () => { ffmpeg: boolean };
  loadStartupData: (
    settings: AppSettings,
    updateStatus: (text: string, progress: number) => void,
  ) => Promise<PreloadedData>;
  warmLibrary: (settings: AppSettings) => Promise<void>;
  setPreloadedData: (data: PreloadedData) => void;
  loadQueue: () => void;
  cleanupThumbnails: () => void;
  sendQueueUpdateImmediate: () => void;
  hasActiveDownloads: () => boolean;
  getIsQuitting: () => boolean;
  setIsQuitting: (value: boolean) => void;
  writeLog: (error: unknown) => void;
  logger?: ScopedLogger;
}

export class WindowLifecycleService {
  private mainWindow: BrowserWindow | null = null;
  private splashWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private youtubeEmbedIdentityConfigured = false;
  private rendererReady = false;

  constructor(private readonly dependencies: WindowLifecycleDependencies) {}

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  markRendererReady(): void {
    this.rendererReady = true;
  }

  updateTrayTooltip(text?: string): void {
    if (!this.tray) return;
    this.tray.setToolTip(text || 'OmniAnime');
  }

  createTray(): void {
    if (this.tray) return;

    try {
      const iconPath = this.dependencies.getAppIconPath();
      if (!fs.existsSync(iconPath)) {
        (this.dependencies.logger ?? noopScopedLogger).warn(`tray: icono no encontrado en ${iconPath}`);
        return;
      }

      this.tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Abrir OmniAnime', click: () => this.mainWindow?.show() },
        { type: 'separator' },
        {
          label: 'Salir',
          click: () => {
            this.dependencies.setIsQuitting(true);
            app.quit();
          },
        },
      ]);

      this.updateTrayTooltip();
      this.tray.setContextMenu(contextMenu);
      this.tray.on('double-click', () => this.mainWindow?.show());
    } catch (error) {
      (this.dependencies.logger ?? noopScopedLogger).error(`tray: ${error}`);
    }
  }

  destroyTray(): void {
    if (!this.tray) return;
    this.tray.destroy();
    this.tray = null;
  }

  start(): void {
    this.createWindows();
  }

  configureYouTubeEmbedIdentity(): void {
    if (this.youtubeEmbedIdentityConfigured) return;

    const defaultSession = session.defaultSession;
    if (!defaultSession) return;

    this.youtubeEmbedIdentityConfigured = true;
    defaultSession.webRequest.onBeforeSendHeaders(
      {
        urls: [
          'https://www.youtube.com/*',
          'https://youtube.com/*',
          'https://www.youtube-nocookie.com/*',
          'https://*.googlevideo.com/*',
          'https://youtubei.googleapis.com/*',
          'https://*.youtubei.googleapis.com/*',
        ],
      },
      (details, callback) => {
        callback({ requestHeaders: applyYouTubeEmbedIdentityHeaders({ ...(details.requestHeaders || {}) }) });
      },
    );
  }

  private createWindows(): void {
    this.splashWindow = new BrowserWindow({
      width: 420,
      height: 320,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: this.dependencies.getSplashPreloadPath(),
      },
    });
    this.splashWindow.loadFile(this.dependencies.getSplashHtmlPath());
    this.splashWindow.center();

    // Buffer: los primeros updateStatus pueden llegar antes de did-finish-load
    // y perderse (webContents.send a renderer aún no listo). Se encolan y se
    // vacían en orden al cargar, con límite para evitar bloat.
    let splashLoaded = false;
    const pendingStatus: Array<{ text: string; progress: number }> = [];
    const sendStatusNow = (text: string, progress: number): void => {
      if (this.splashWindow && !this.splashWindow.isDestroyed()) {
        this.splashWindow.webContents.send('splash-status', { text, progress });
      }
    };
    const flushPendingStatus = (): void => {
      if (splashLoaded) return;
      splashLoaded = true;
      for (const item of pendingStatus.splice(0, pendingStatus.length)) {
        sendStatusNow(item.text, item.progress);
      }
    };
    try {
      this.splashWindow.webContents.on('did-finish-load', flushPendingStatus);
      this.splashWindow.once('ready-to-show', flushPendingStatus);
      // Red de seguridad: si el evento no llega, no retener estados más de 2s
      setTimeout(flushPendingStatus, 2000);
    } catch {}

    const updateStatus = (text: string, progress: number): void => {
      const payload = { text: String(text || ''), progress: clampSplashProgress(progress) };
      if (!splashLoaded) {
        if (pendingStatus.length < SPLASH_STATUS_BUFFER_LIMIT) pendingStatus.push(payload);
        else pendingStatus[pendingStatus.length - 1] = payload;
        return;
      }
      sendStatusNow(payload.text, payload.progress);
    };

    void this.bootstrap(updateStatus);
  }

  private async bootstrap(updateStatus: (text: string, progress: number) => void): Promise<void> {
    let windowIsReady = false;
    let loadingIsComplete = false;

    const maybeShowMainWindow = (): void => {
      if (windowIsReady && loadingIsComplete && this.mainWindow) {
        this.dependencies.loadQueue();
        setImmediate(() => {
          try {
            this.dependencies.cleanupThumbnails();
          } catch {}
        });

        // Secuencial cine: splash se toma su tiempo → gap → app lenta
        // Aislado: solo handoff splash→app, no toca splash-in/shimmer/view-enter
        setTimeout(() => {
          // 1) Splash out 420ms ease-out (--ease-out 0.23,1,0.32,1)
          this.splashWindow?.setOpacity(1);
          const durationOut = 420;
          const startOut = Date.now();
          const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
          const easeDrawer = (t: number): number => 1 - Math.pow(1 - t, 3.8); // --ease-drawer 0.32,0.72,0,1

          const tickOut = setInterval(() => {
            const p = Math.min(1, (Date.now() - startOut) / durationOut);
            this.splashWindow?.setOpacity(1 - easeOut(p));
            if (p >= 1) {
              clearInterval(tickOut);
              this.splashWindow?.close();
              // 2) Gap 200ms (respiro vacío)
              setTimeout(() => {
                this.mainWindow?.setOpacity(0);
                this.mainWindow?.show();
                this.mainWindow?.webContents.send('app-ready');
                const durationIn = 620;
                const startIn = Date.now();
                const tickIn = setInterval(() => {
                  const p2 = Math.min(1, (Date.now() - startIn) / durationIn);
                  this.mainWindow?.setOpacity(easeDrawer(p2));
                  if (p2 >= 1) {
                    clearInterval(tickIn);
                    this.mainWindow?.setOpacity(1);
                  }
                }, 16);
              }, 200);
            }
          }, 16);
        }, 80);
      }
    };

    try {
      // Solo paint inicial del splash, sin retardo artificial (antes 500ms)
      await new Promise((resolve) => setTimeout(resolve, 120));

      updateStatus('Iniciando base de datos local...', 8);
      await this.dependencies.initializeDatabase();

      updateStatus('Cargando preferencias locales...', 16);
      const settings = this.dependencies.getSettings();
      this.dependencies.setActiveProvider(settings.defaultProvider || 'animeav1');

      this.mainWindow = new BrowserWindow({
        width: 1300,
        height: 900,
        show: false,
        backgroundColor: '#0b0e14',
        title: 'OmniAnime',
        icon: this.dependencies.getAppIconPath(),
        frame: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          preload: this.dependencies.getPreloadPath(),
          powerPreference: 'high-performance',
        } as any,
      });
      this.mainWindow.setMenuBarVisibility(false);
      this.mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.mainWindow.webContents.on('will-navigate', (event, url) => {
        const allowedUrl = this.dependencies.isPackaged()
          ? url.startsWith('file://')
          : url.startsWith(this.dependencies.getDevServerUrl());
        if (!allowedUrl) event.preventDefault();
      });

      const emitWindowState = (): void => {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        this.mainWindow.webContents.send('window-state-changed', {
          isMaximized: this.mainWindow.isMaximized(),
        });
      };

      this.mainWindow.on('close', (event) => {
        const latestSettings = this.dependencies.getSettings();
        const closeAction = resolveWindowCloseAction(
          this.dependencies.getIsQuitting(),
          latestSettings.minimizeToTrayOnClose === true,
          this.dependencies.hasActiveDownloads(),
        );

        if (closeAction === 'allow') {
          this.dependencies.setIsQuitting(true);
          return;
        }

        if (closeAction === 'hide') {
          event.preventDefault();
          this.mainWindow?.hide();
          return;
        }

        event.preventDefault();
        this.mainWindow?.webContents.send('confirm-app-close');
      });

      if (settings.minimizeToTrayOnClose === true) {
        this.createTray();
      }
      updateStatus('Preparando interfaz principal...', 28);

      this.mainWindow.once('ready-to-show', () => {
        windowIsReady = true;
        emitWindowState();
        maybeShowMainWindow();
      });
      this.mainWindow.on('maximize', emitWindowState);
      this.mainWindow.on('unmaximize', emitWindowState);
      this.mainWindow.on('restore', () => {
        emitWindowState();
        this.dependencies.sendQueueUpdateImmediate();
      });
      this.mainWindow.on('show', () => this.dependencies.sendQueueUpdateImmediate());

      if (this.dependencies.isPackaged()) {
        await this.mainWindow.loadFile(this.dependencies.getAppHtmlPath());
      } else {
        try {
          await this.mainWindow.loadURL(this.dependencies.getDevServerUrl());
          this.mainWindow.webContents.openDevTools();
        } catch {
          await this.mainWindow.loadFile(this.dependencies.getAppHtmlPath());
        }
      }

      // Precarga con timeout: si la red/proveedor cuelga, degradado con
      // datos locales en vez de splash infinito. Ignora updates tardíos.
      let startupSettled = false;
      const startupUpdate = (text: string, progress: number): void => {
        if (!startupSettled) updateStatus(text, progress);
      };
      const startupResult = await withStartupTimeout(
        this.dependencies.loadStartupData(settings, startupUpdate),
        SPLASH_BOOT_TIMEOUT_MS,
      );
      startupSettled = true;

      let preloadedData: PreloadedData;
      if (startupResult.timedOut || !startupResult.value) {
        this.dependencies.writeLog('Splash: timeout en precarga, continuando degradado');
        updateStatus('Sin conexión, continuando con datos locales...', 70);
        preloadedData = {
          providerId: this.dependencies.getActiveProviderId(),
          home: null,
          filters: null,
          catalog: null,
          libraryMeta: [],
        };
      } else {
        preloadedData = startupResult.value;
      }
      this.dependencies.setPreloadedData(preloadedData);

      // Sin sleep artificial: la caché ya quedó sembrada en loadStartupData.
      // Se cede un tick para pintar el 78% antes del check de tools (<10ms).
      updateStatus('Optimizando caché en memoria...', 78);
      await new Promise((resolve) => setImmediate(resolve));

      // Verificación ligera real (existsSync, sin spawn): el --version
      // detallado sigue on-demand en Ajustes + probe en background.
      let tools: { ffmpeg: boolean } | null = null;
      try {
        tools = this.dependencies.checkTools?.() ?? null;
      } catch {
        tools = null;
      }
      updateStatus(buildToolsStatusText(tools), 92);

      const providerLabel = this.dependencies.getActiveProviderId() === 'jkanime' ? 'JkAnime' : 'AnimeAV1';
      updateStatus(`Todo listo. Iniciando ${providerLabel}...`, 100);
      // Handoff retenido hasta que el renderer pinte home con datos (o tope,
      // para no colgar el splash si el renderer no avisa).
      await waitForRendererReady(() => this.rendererReady, RENDERER_READY_TIMEOUT_MS);
      loadingIsComplete = true;
      maybeShowMainWindow();

      void this.dependencies.warmLibrary(settings).catch(() => null);
    } catch (error) {
      this.dependencies.writeLog('Error en splash: ' + String(error));
      loadingIsComplete = true;
      windowIsReady = true;

      if (this.mainWindow) {
        if (!this.mainWindow.webContents.getURL()) {
          if (this.dependencies.isPackaged()) {
            await this.mainWindow.loadFile(this.dependencies.getAppHtmlPath());
          } else {
            try {
              await this.mainWindow.loadURL(this.dependencies.getDevServerUrl());
            } catch {
              await this.mainWindow.loadFile(this.dependencies.getAppHtmlPath());
            }
          }
        }
        this.mainWindow.show();
      }
      this.splashWindow?.close();
    }
  }
}

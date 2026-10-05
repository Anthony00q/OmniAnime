import { createContext, memo, lazy, Suspense, useCallback, useContext, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import clsx from 'clsx';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppTooltipProvider } from './components/ui/AppTooltip';
import { Dialog } from './components/Dialog';
import { useActiveProvider, useLoadSettings, prefetchAnimeDetails } from './hooks/useQueries';
import { useAppUpdate } from './hooks/useAppUpdate';
import { UpdateModal } from './components/update/UpdateModal';
import { useThemeSync } from './hooks/useThemeSync';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useDownloadNotifications, useToastReconcile } from './hooks/useDownloadNotifications';
import { viewIdFromPath } from './utils/viewRoutes';
import {
  selectedAnimeAtom,
  activeProviderAtom,
  settingsAtom,
  toastPositionAtom,
  showCloseConfirmAtom,
  providerChangedCounterAtom,
} from './store/atoms';

const MAX_VISIBLE_TOASTS = 3;
const TOAST_DURATION_MS = 4000;

// Vistas del shell: lazy para cargar cada una al entrar y memo para que los
// re-renders del chrome (toasts, ajustes, proveedor) no las arrastren.
const HomeView = lazy(() => import('./views/home/HomeView').then((m) => ({ default: m.HomeView })));
const ScheduleView = lazy(() => import('./views/schedule/ScheduleView').then((m) => ({ default: m.ScheduleView })));
const CatalogView = lazy(() => import('./views/catalog/CatalogView').then((m) => ({ default: m.CatalogView })));
const AnimeDetailsView = lazy(() =>
  import('./views/animeDetails/AnimeDetailsView').then((m) => ({ default: m.AnimeDetailsView })),
);
const DownloaderView = lazy(() =>
  import('./views/downloader/DownloaderView').then((m) => ({ default: m.DownloaderView })),
);
const HistoryView = lazy(() => import('./views/history/HistoryView').then((m) => ({ default: m.HistoryView })));
const ScannerView = lazy(() => import('./views/scanner/ScannerView').then((m) => ({ default: m.ScannerView })));
const LibraryView = lazy(() => import('./views/library/LibraryView').then((m) => ({ default: m.LibraryView })));
const SettingsView = lazy(() => import('./views/settings/SettingsView').then((m) => ({ default: m.SettingsView })));

export const MemoHomeView = memo(HomeView);
export const MemoScheduleView = memo(ScheduleView);
export const MemoCatalogView = memo(CatalogView);
export const MemoAnimeDetailsView = memo(AnimeDetailsView);
export const MemoDownloaderView = memo(DownloaderView);
export const MemoHistoryView = memo(HistoryView);
export const MemoScannerView = memo(ScannerView);
export const MemoLibraryView = memo(LibraryView);
export const MemoSettingsView = memo(SettingsView);

export interface AppShellHandlers {
  onSelectAnime: (slug: string) => void;
  onDetailsBack: () => void;
}

// El shell comparte sus handlers estables con las rutas para que las vistas
// reciban siempre los mismos props.
const AppShellContext = createContext<AppShellHandlers | null>(null);

export function useAppShell(): AppShellHandlers {
  const handlers = useContext(AppShellContext);
  if (!handlers) throw new Error('useAppShell solo funciona dentro del shell de la app');
  return handlers;
}

export default function App() {
  const { pathname } = useLocation();
  const currentView = viewIdFromPath(pathname) ?? 'home';
  const [activeProvider, setActiveProvider] = useAtom(activeProviderAtom);
  const [toastPosition, setToastPosition] = useAtom(toastPositionAtom);
  const [showCloseConfirm, setShowCloseConfirm] = useAtom(showCloseConfirmAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const setSelectedAnime = useSetAtom(selectedAnimeAtom);
  const providerChangedCounter = useAtomValue(providerChangedCounterAtom);
  const { data: loadedActiveProvider } = useActiveProvider();
  const { setView: navigateView, openAnime, detailsBack } = useAppNavigation();

  const toastOptions = useMemo(
    () => ({
      className: 'flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold max-w-sm select-none',
      style: {
        background: 'var(--color-popover)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: '12px',
        color: 'var(--color-popover-foreground)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
      },
    }),
    [],
  );
  const { data: loadedSettings } = useLoadSettings();

  useThemeSync();
  useKeyboardNavigation();
  useDownloadNotifications();
  useToastReconcile();
  useAppUpdate();

  useEffect(() => {
    if (loadedActiveProvider) setActiveProvider(loadedActiveProvider);
  }, [loadedActiveProvider, setActiveProvider]);

  useEffect(() => {
    if (settings?.toastPosition) setToastPosition(settings.toastPosition);
  }, [settings?.toastPosition, setToastPosition]);

  useEffect(() => {
    if (loadedSettings !== undefined) setSettings(loadedSettings || {});
  }, [loadedSettings, setSettings]);

  // Nota: 'app-ready' lo emite el main tras el handoff del splash y queda
  // disponible como hook para E2E; aquí no se suscribe nada (antes no-op).
  useEffect(() => {
    const handleConfirmClose = () => setShowCloseConfirm(true);

    window.api.on('confirm-app-close', handleConfirmClose);

    return () => {
      window.api.removeListener('confirm-app-close', handleConfirmClose);
    };
  }, [setShowCloseConfirm]);

  useEffect(() => {
    if (providerChangedCounter > 0) {
      setSelectedAnime(null);
    }
  }, [providerChangedCounter, setSelectedAnime]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.select-text')) {
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.('.omnianime-sidebar')) active.blur();
  }, [currentView]);

  const handleSetView = useCallback(
    (view: string) => {
      navigateView(view);
    },
    [navigateView],
  );

  const queryClient = useQueryClient();
  const handleSelectAnime = useCallback(
    (slug: string) => {
      prefetchAnimeDetails(queryClient, activeProvider, slug);
      openAnime(slug);
    },
    [queryClient, activeProvider, openAnime],
  );

  const handleDetailsBack = useCallback(() => {
    detailsBack();
  }, [detailsBack]);

  const shellContext = useMemo<AppShellHandlers>(
    () => ({ onSelectAnime: handleSelectAnime, onDetailsBack: handleDetailsBack }),
    [handleSelectAnime, handleDetailsBack],
  );

  return (
    <AppShellContext.Provider value={shellContext}>
      <AppTooltipProvider>
        <div className="flex h-screen overflow-hidden bg-background text-foreground flex-col relative">
          <Toaster
            theme="dark"
            position={toastPosition}
            visibleToasts={MAX_VISIBLE_TOASTS}
            duration={TOAST_DURATION_MS}
            closeButton
            richColors
            gap={12}
            offset={{ top: '48px', bottom: '16px', left: '16px', right: '16px' }}
            toastOptions={toastOptions}
          />
          <Titlebar />

          <div className="flex h-full overflow-hidden relative">
            <Sidebar currentView={currentView} setCurrentView={handleSetView} />

            <main className="flex-1 min-w-0 overflow-hidden relative flex flex-col">
              <ErrorBoundary scope="ui:downloader">
                <div
                  className={clsx(
                    'flex-1 overflow-hidden flex flex-col pt-10',
                    currentView !== 'downloader' && 'hidden',
                    currentView === 'downloader' && 'view-enter',
                  )}
                >
                  <Suspense fallback={null}>
                    <MemoDownloaderView
                      onSelectAnime={handleSelectAnime}
                      activeProvider={activeProvider}
                      isActive={currentView === 'downloader'}
                    />
                  </Suspense>
                </div>
              </ErrorBoundary>
              <Outlet />
            </main>
          </div>

          {showCloseConfirm && (
            <Dialog
              open={showCloseConfirm}
              onOpenChange={setShowCloseConfirm}
              title="¿Cerrar aplicación?"
              message="Tienes descargas en progreso. Si cierras la aplicación ahora, se cancelarán las descargas activas y tendrás que reanudarlas más tarde. ¿Realmente deseas salir?"
              confirmLabel="Sí, salir"
              danger={true}
              onConfirm={async () => {
                await window.api.invoke('force-close-app');
              }}
            />
          )}
          <UpdateModal />
        </div>
      </AppTooltipProvider>
    </AppShellContext.Provider>
  );
}

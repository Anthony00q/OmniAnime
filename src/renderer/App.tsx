import { useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Toaster } from 'sonner';
import clsx from 'clsx';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppTooltipProvider } from './components/ui/AppTooltip';
import { Dialog } from './components/Dialog';
import { HomeView } from './views/HomeView';
import { CatalogView } from './views/CatalogView';
import { AnimeDetailsView } from './views/AnimeDetailsView';
import { LibraryView } from './views/LibraryView';
import { DownloaderView } from './views/DownloaderView';
import { HistoryView } from './views/HistoryView';
import { ScannerView } from './views/ScannerView';
import { SettingsView } from './views/SettingsView';
import { useActiveProvider, useLoadSettings } from './hooks/useQueries';
import { useThemeSync } from './hooks/useThemeSync';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useDownloadNotifications, useToastReconcile } from './hooks/useDownloadNotifications';
import {
  currentViewAtom,
  previousViewAtom,
  selectedAnimeAtom,
  activeProviderAtom,
  settingsAtom,
  toastPositionAtom,
  showCloseConfirmAtom,
  providerChangedCounterAtom,
  navigateToCatalogCounterAtom,
} from './store/atoms';

const MAX_VISIBLE_TOASTS = 3;
const TOAST_DURATION_MS = 4000;

function getViewPanelClass(currentView: string, view: string): string {
  return clsx(
    'flex-1 overflow-hidden flex flex-col',
    currentView !== view && 'hidden',
    currentView === view && 'view-enter',
  );
}

export default function App() {
  const [currentView, setCurrentView] = useAtom(currentViewAtom);
  const [previousView, setPreviousView] = useAtom(previousViewAtom);
  const [selectedAnime, setSelectedAnime] = useAtom(selectedAnimeAtom);
  const [activeProvider, setActiveProvider] = useAtom(activeProviderAtom);
  const [toastPosition, setToastPosition] = useAtom(toastPositionAtom);
  const [showCloseConfirm, setShowCloseConfirm] = useAtom(showCloseConfirmAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const providerChangedCounter = useAtomValue(providerChangedCounterAtom);
  const navigateToCatalogCounter = useAtomValue(navigateToCatalogCounterAtom);
  const { data: loadedActiveProvider } = useActiveProvider();

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
    if (navigateToCatalogCounter > 0) {
      setSelectedAnime(null);
      setCurrentView('catalog');
    }
  }, [navigateToCatalogCounter, setCurrentView, setSelectedAnime]);

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

  const handleSetView = (view: string) => {
    if (currentView !== 'details' && currentView !== 'settings') {
      setPreviousView(currentView);
    }
    setCurrentView(view);
  };

  const handleSelectAnime = (slug: string) => {
    if (currentView !== 'details') {
      setPreviousView(currentView);
    }
    setSelectedAnime(slug);
    setCurrentView('details');
  };

  const handleDetailsBack = () => {
    setSelectedAnime(null);
    setCurrentView(previousView || 'home');
  };

  return (
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

        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar currentView={currentView} setCurrentView={handleSetView} />

          <main className="flex-1 min-w-0 overflow-hidden relative flex flex-col">
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'home')}>
                <HomeView isActive={currentView === 'home'} />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'catalog')}>
                <CatalogView />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'details')}>
                <AnimeDetailsView
                  slug={selectedAnime || ''}
                  onBack={handleDetailsBack}
                  onSelectAnime={handleSelectAnime}
                  isActive={currentView === 'details'}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'downloader')}>
                <DownloaderView
                  onSelectAnime={handleSelectAnime}
                  activeProvider={activeProvider}
                  isActive={currentView === 'downloader'}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'history')}>
                <HistoryView
                  isActive={currentView === 'history'}
                  activeProvider={activeProvider}
                  onSelectAnime={handleSelectAnime}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'scanner')}>
                <ScannerView isActive={currentView === 'scanner'} />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'player')}>
                <LibraryView
                  onSelectAnime={handleSelectAnime}
                  activeProvider={activeProvider}
                  isActive={currentView === 'player'}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary>
              <div className={getViewPanelClass(currentView, 'settings')}>
                <SettingsView isActive={currentView === 'settings'} />
              </div>
            </ErrorBoundary>
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
      </div>
    </AppTooltipProvider>
  );
}

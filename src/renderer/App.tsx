import { memo, useCallback, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import clsx from 'clsx';
import { Titlebar } from './components/Titlebar';
import { Sidebar } from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppTooltipProvider } from './components/ui/AppTooltip';
import { Dialog } from './components/Dialog';
import { HomeView } from '@/renderer/views/home/HomeView';
import { ScheduleView } from '@/renderer/views/schedule/ScheduleView';
import { CatalogView } from '@/renderer/views/catalog/CatalogView';
import { AnimeDetailsView } from '@/renderer/views/animeDetails/AnimeDetailsView';
import { LibraryView } from '@/renderer/views/library/LibraryView';
import { DownloaderView } from '@/renderer/views/downloader/DownloaderView';
import { HistoryView } from '@/renderer/views/history/HistoryView';
import { ScannerView } from '@/renderer/views/scanner/ScannerView';
import { SettingsView } from '@/renderer/views/settings/SettingsView';
import { useActiveProvider, useLoadSettings, prefetchAnimeDetails } from './hooks/useQueries';
import { useAppUpdate } from './hooks/useAppUpdate';
import { UpdateModal } from './components/update/UpdateModal';
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
    view !== 'details' && view !== 'player' && 'pt-10',
    currentView !== view && 'hidden',
    currentView === view && 'view-enter',
  );
}

// Que App se re-renderice (toasts, ajustes, proveedor) no arrastra las vistas que nada repintan.
const MemoHomeView = memo(HomeView);
const MemoScheduleView = memo(ScheduleView);
const MemoCatalogView = memo(CatalogView);
const MemoAnimeDetailsView = memo(AnimeDetailsView);
const MemoDownloaderView = memo(DownloaderView);
const MemoHistoryView = memo(HistoryView);
const MemoScannerView = memo(ScannerView);
const MemoLibraryView = memo(LibraryView);
const MemoSettingsView = memo(SettingsView);

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

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.('.omnianime-sidebar')) active.blur();
  }, [currentView]);

  const handleSetView = useCallback(
    (view: string) => {
      if (currentView !== 'details' && currentView !== 'settings') {
        setPreviousView(currentView);
      }
      setCurrentView(view);
    },
    [currentView, setPreviousView, setCurrentView],
  );

  const queryClient = useQueryClient();
  const handleSelectAnime = useCallback(
    (slug: string) => {
      prefetchAnimeDetails(queryClient, activeProvider, slug);
      if (currentView !== 'details') {
        setPreviousView(currentView);
      }
      setSelectedAnime(slug);
      setCurrentView('details');
    },
    [queryClient, activeProvider, currentView, setPreviousView, setSelectedAnime, setCurrentView],
  );

  const handleDetailsBack = useCallback(() => {
    setSelectedAnime(null);
    setCurrentView(previousView || 'home');
  }, [previousView, setSelectedAnime, setCurrentView]);

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

        <div className="flex h-full overflow-hidden relative">
          <Sidebar currentView={currentView} setCurrentView={handleSetView} />

          <main className="flex-1 min-w-0 overflow-hidden relative flex flex-col">
            <ErrorBoundary scope="ui:home">
              <div className={getViewPanelClass(currentView, 'home')}>
                <MemoHomeView isActive={currentView === 'home'} />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:schedule">
              <div className={getViewPanelClass(currentView, 'schedule')}>
                <MemoScheduleView isActive={currentView === 'schedule'} />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:catalog">
              <div className={getViewPanelClass(currentView, 'catalog')}>
                <MemoCatalogView />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:details">
              <div className={getViewPanelClass(currentView, 'details')}>
                <MemoAnimeDetailsView
                  slug={selectedAnime || ''}
                  onBack={handleDetailsBack}
                  onSelectAnime={handleSelectAnime}
                  isActive={currentView === 'details'}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:downloader">
              <div className={getViewPanelClass(currentView, 'downloader')}>
                <MemoDownloaderView
                  onSelectAnime={handleSelectAnime}
                  activeProvider={activeProvider}
                  isActive={currentView === 'downloader'}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:history">
              <div className={getViewPanelClass(currentView, 'history')}>
                <MemoHistoryView
                  isActive={currentView === 'history'}
                  activeProvider={activeProvider}
                  onSelectAnime={handleSelectAnime}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:scanner">
              <div className={getViewPanelClass(currentView, 'scanner')}>
                <MemoScannerView isActive={currentView === 'scanner'} />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:library">
              <div className={getViewPanelClass(currentView, 'player')}>
                <MemoLibraryView
                  onSelectAnime={handleSelectAnime}
                  activeProvider={activeProvider}
                  isActive={currentView === 'player'}
                />
              </div>
            </ErrorBoundary>
            <ErrorBoundary scope="ui:settings">
              <div className={getViewPanelClass(currentView, 'settings')}>
                <MemoSettingsView isActive={currentView === 'settings'} />
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
        <UpdateModal />
      </div>
    </AppTooltipProvider>
  );
}

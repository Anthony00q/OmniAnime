import { useState, useEffect, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import {
  Home,
  Library,
  BookOpen,
  Download,
  Clock,
  Search,
  PlaySquare,
  Settings,
  Server,
  CircleArrowUp,
} from 'lucide-react';
import clsx from 'clsx';
import {
  activeProviderAtom,
  providerChangedCounterAtom,
  appUpdateAvailableAtom,
  appUpdateModalOpenAtom,
} from '../store/atoms';
import { AppTooltip } from './ui/AppTooltip';

interface SidebarProps {
  currentView: string;
  setCurrentView: (v: string) => void;
}

export function Sidebar({ currentView, setCurrentView }: SidebarProps) {
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [activeProvider, setActiveProvider] = useAtom(activeProviderAtom);
  const setProviderChanged = useSetAtom(providerChangedCounterAtom);
  const updateAvailable = useAtomValue(appUpdateAvailableAtom);
  const updateModalOpen = useAtomValue(appUpdateModalOpenAtom);
  const setUpdateModalOpen = useSetAtom(appUpdateModalOpenAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    window.api
      .invoke('get-providers')
      .then(setProviders)
      .catch(() => {});
  }, []);

  // Optimista: pinta el indicador en el mismo frame y persiste en background.
  const handleProviderChange = useCallback(
    (id: string) => {
      if (id === activeProvider) return;
      const prev = activeProvider;
      setActiveProvider(id);
      queryClient.setQueryData(['active-provider'], id);
      setProviderChanged((c) => c + 1);
      window.dispatchEvent(new Event('provider-changed'));
      // Cancela peticiones en vuelo del proveedor anterior: con provider
      // explícito por petición ya no contaminan, esto solo ahorra red.
      // Sin await para no devolver la latencia al indicador (optimista).
      void queryClient.cancelQueries({ queryKey: ['home'] }).catch(() => {});
      void queryClient.cancelQueries({ queryKey: ['catalog'] }).catch(() => {});
      void queryClient.cancelQueries({ queryKey: ['search'] }).catch(() => {});
      void queryClient.cancelQueries({ queryKey: ['filters'] }).catch(() => {});
      void queryClient.cancelQueries({ queryKey: ['details'] }).catch(() => {});
      const rollbackIfStale = () => {
        if (queryClient.getQueryData(['active-provider']) !== id) return;
        setActiveProvider(prev);
        queryClient.setQueryData(['active-provider'], prev);
      };
      void window.api
        .invoke('set-active-provider', id)
        .then((result) => {
          if (result === false) rollbackIfStale();
        })
        .catch(rollbackIfStale);
    },
    [activeProvider, queryClient, setActiveProvider, setProviderChanged],
  );

  const items = [
    { id: 'home', icon: Home, label: 'Inicio' },
    { id: 'catalog', icon: Library, label: 'Catálogo' },
    { id: 'details', icon: BookOpen, label: 'Detalles' },
    { id: 'downloader', icon: Download, label: 'Descargas' },
    { id: 'history', icon: Clock, label: 'Historial' },
    { id: 'scanner', icon: Search, label: 'Escáner' },
    { id: 'player', icon: PlaySquare, label: 'Librería' },
  ];

  const providerOptions =
    providers.length > 0
      ? providers
      : [
          { id: 'animeav1', name: 'AnimeAV1' },
          { id: 'jkanime', name: 'JkAnime' },
        ];
  const activeProviderIndex = providerOptions.findIndex((provider) => provider.id === activeProvider);

  return (
    <nav
      aria-label="Navegación principal"
      className="omnianime-sidebar w-[220px] shrink-0 bg-surface border-r border-border/70 flex flex-col pt-6 pb-4"
    >
      <div className="sidebar-provider-section px-4 mb-6">
        <div className="sidebar-heading text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2 flex items-center gap-1.5 select-none">
          <Server className="w-3 h-3" /> Fuente de Datos
        </div>

        <div className="sidebar-provider-switcher relative rounded-xl border border-border/70 bg-background/40 p-1 min-h-9">
          <div
            className="sidebar-provider-grid relative grid min-h-7 gap-1"
            style={{ gridTemplateColumns: `repeat(${providerOptions.length}, minmax(0, 1fr))` }}
          >
            {activeProviderIndex >= 0 && (
              <span
                aria-hidden="true"
                className="sidebar-provider-indicator pointer-events-none absolute inset-y-0 left-0 z-0 rounded-lg border border-border-strong bg-surface-elevated shadow-sm"
                style={{
                  width: `calc((100% - ${(providerOptions.length - 1) * 0.25}rem) / ${providerOptions.length})`,
                  transform: `translateX(calc(${activeProviderIndex * 100}% + ${activeProviderIndex * 0.25}rem))`,
                }}
              />
            )}

            {providerOptions.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => handleProviderChange(provider.id)}
                aria-label={`Cambiar fuente a ${provider.name}`}
                aria-pressed={activeProvider === provider.id}
                className={clsx(
                  'sidebar-provider-button relative z-10 min-h-7 cursor-pointer select-none rounded-lg border border-transparent bg-transparent text-center text-xs font-bold shadow-none',
                  activeProvider === provider.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
                )}
              >
                <span className="sidebar-provider-full">{provider.name}</span>
                <span className="sidebar-provider-short" aria-hidden="true">
                  {provider.name.slice(0, 1).toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 space-y-1">
        <h3 className="sidebar-heading px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Explorar
        </h3>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'sidebar-nav-item relative w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium border transition-[background-color,border-color,color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                isActive
                  ? 'bg-primary/10 text-primary border-primary/15 shadow-sm'
                  : 'bg-transparent text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground hover:border-border/50',
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full transition-opacity duration-150 [transition-timing-function:var(--ease-out)]',
                  isActive ? 'bg-primary opacity-100' : 'bg-transparent opacity-0',
                )}
              />
              <Icon strokeWidth={isActive ? 2 : 1.5} className="w-[18px] h-[18px]" />
              <span className="sidebar-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-settings px-3 mt-auto pt-3 border-t border-border/60">
        {updateAvailable && !updateModalOpen && (
          <AppTooltip content={`Actualización disponible (${updateAvailable.version})`} side="right" align="center">
            <button
              type="button"
              onClick={() => setUpdateModalOpen(true)}
              aria-label={`Ver actualización disponible ${updateAvailable.version}`}
              className="sidebar-nav-item relative w-full flex items-center gap-3 px-4 py-2.5 mb-1 rounded-lg text-sm font-bold border border-transparent bg-primary text-primary-foreground transition-[background-color,border-color,color] duration-150 [transition-timing-function:var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer hover:bg-primary/90"
            >
              <CircleArrowUp strokeWidth={2} className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
              <span className="sidebar-label">Actualizar</span>
              <span className="sidebar-label ml-auto text-[11px] font-bold tabular-nums whitespace-nowrap">
                {updateAvailable.version}
              </span>
            </button>
          </AppTooltip>
        )}
        <button
          type="button"
          onClick={() => setCurrentView('settings')}
          aria-current={currentView === 'settings' ? 'page' : undefined}
          className={clsx(
            'sidebar-nav-item relative w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium border transition-[background-color,border-color,color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            currentView === 'settings'
              ? 'bg-primary/10 text-primary border-primary/15 shadow-sm'
              : 'bg-transparent text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground hover:border-border/50',
          )}
        >
          <span
            aria-hidden="true"
            className={clsx(
              'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full transition-opacity duration-150 [transition-timing-function:var(--ease-out)]',
              currentView === 'settings' ? 'bg-primary opacity-100' : 'bg-transparent opacity-0',
            )}
          />
          <Settings strokeWidth={1.5} className="w-[18px] h-[18px]" />
          <span className="sidebar-label">Ajustes</span>
        </button>
      </div>
    </nav>
  );
}

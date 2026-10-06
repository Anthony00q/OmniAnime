import { useEffect, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  Home,
  CalendarDays,
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
import { activeProviderAtom, appUpdateAvailableAtom, appUpdateModalOpenAtom } from '@/renderer/store/atoms';
import { useProvidersList, useProviderSwitch } from '@/renderer/hooks/useQueries';
import { AppTooltip } from './ui/AppTooltip';
import animeav1Icon from '@assets/provider-icons/animeav1-32.png';
import animeav1Icon2x from '@assets/provider-icons/animeav1-64.png';
import jkanimeIcon from '@assets/provider-icons/jkanime-32.png';
import jkanimeIcon2x from '@assets/provider-icons/jkanime-64.png';

interface SidebarProps {
  currentView: string;
  setCurrentView: (v: string) => void;
}

const PROVIDER_ICONS: Record<string, { src: string; src2x: string }> = {
  animeav1: { src: animeav1Icon, src2x: animeav1Icon2x },
  jkanime: { src: jkanimeIcon, src2x: jkanimeIcon2x },
};

export function Sidebar({ currentView, setCurrentView }: SidebarProps) {
  const providers = useProvidersList();
  const handleProviderChange = useProviderSwitch();
  const activeProvider = useAtomValue(activeProviderAtom);
  const [iconErrors, setIconErrors] = useState<Record<string, boolean>>({});
  // El pill pinta urgente con estado local; el rollback de useProviderSwitch lo resincroniza.
  const [shownProvider, setShownProvider] = useState(activeProvider);
  useEffect(() => setShownProvider(activeProvider), [activeProvider]);
  const updateAvailable = useAtomValue(appUpdateAvailableAtom);
  const updateModalOpen = useAtomValue(appUpdateModalOpenAtom);
  const setUpdateModalOpen = useSetAtom(appUpdateModalOpenAtom);

  const items = [
    { id: 'home', icon: Home, label: 'Inicio' },
    { id: 'schedule', icon: CalendarDays, label: 'Horarios' },
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
  const activeProviderIndex = providerOptions.findIndex((provider) => provider.id === shownProvider);

  return (
    <nav
      aria-label="Navegación principal"
      className="omnianime-sidebar w-[220px] shrink-0 bg-background border-r border-border/30 flex flex-col pt-12 pb-4"
    >
      <div className="sidebar-provider-section px-4 mb-5">
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

            {providerOptions.map((provider) => {
              const icon = PROVIDER_ICONS[provider.id];
              const showIcon = Boolean(icon) && !iconErrors[provider.id];
              return (
                <button
                  key={provider.id}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setShownProvider(provider.id);
                    handleProviderChange(provider.id);
                  }}
                  aria-label={`Cambiar fuente a ${provider.name}`}
                  aria-pressed={shownProvider === provider.id}
                  className={clsx(
                    'sidebar-provider-button relative z-10 inline-flex min-h-7 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg border border-transparent bg-transparent text-center text-xs font-bold shadow-none outline-none focus:outline-none focus-visible:outline-none',
                    activeProvider === provider.id
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground/80',
                  )}
                >
                  {showIcon && (
                    <img
                      src={icon.src}
                      srcSet={`${icon.src2x} 2x`}
                      width={16}
                      height={16}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      decoding="async"
                      className={clsx(
                        'h-4 w-4 shrink-0 rounded-[3px] object-contain transition-opacity duration-150 [transition-timing-function:var(--ease-out)]',
                        shownProvider === provider.id ? 'opacity-100' : 'opacity-70',
                      )}
                      onError={() => setIconErrors((prev) => ({ ...prev, [provider.id]: true }))}
                    />
                  )}
                  <span className="sidebar-provider-full">{provider.name}</span>
                  {!showIcon && (
                    <span className="sidebar-provider-short" aria-hidden="true">
                      {provider.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div aria-hidden="true" className="mx-5 mt-5 h-px bg-border/30" />
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
                  ? 'bg-foreground/[0.06] text-foreground border-foreground/10 shadow-none'
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

      <div className="sidebar-settings px-3 mt-auto pt-4">
        <div aria-hidden="true" className="mx-1 mb-3 h-px bg-border/30" />
        {updateAvailable && !updateModalOpen && (
          <AppTooltip content={`Actualización disponible (${updateAvailable.version})`} side="right" align="center">
            <button
              type="button"
              onClick={() => setUpdateModalOpen(true)}
              aria-label={`Ver actualización disponible ${updateAvailable.version}`}
              className="sidebar-nav-item relative w-full flex items-center gap-3 px-4 py-2.5 mb-1 rounded-lg text-sm font-bold border border-transparent bg-primary text-primary-foreground transition-[background-color,border-color,color] duration-150 [transition-timing-function:var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)]"
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
              ? 'bg-foreground/[0.06] text-foreground border-foreground/10 shadow-none'
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

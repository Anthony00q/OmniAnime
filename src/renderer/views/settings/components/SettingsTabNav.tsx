import { memo, useEffect, useRef, useState } from 'react';
import { unwrap } from '@/renderer/hooks/queries/unwrap';
import { HardDrive, Download, Database, Palette, Bell, Keyboard, ScrollText } from 'lucide-react';

interface TabDef {
  id: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
}

const TABS: TabDef[] = [
  {
    id: 'sistema',
    icon: <HardDrive className="w-4 h-4" />,
    label: 'Sistema',
    desc: 'Carpetas, proveedor, rendimiento',
  },
  {
    id: 'descargas',
    icon: <Download className="w-4 h-4" />,
    label: 'Descargas',
    desc: 'Paralelismo y nombrado',
  },
  {
    id: 'almacenamiento',
    icon: <Database className="w-4 h-4" />,
    label: 'Almacenamiento',
    desc: 'Espacio y limpieza',
  },
  {
    id: 'registros',
    icon: <ScrollText className="w-4 h-4" />,
    label: 'Registros',
    desc: 'Sesiones y diagnóstico',
  },
  {
    id: 'apariencia',
    icon: <Palette className="w-4 h-4" />,
    label: 'Apariencia y UI',
    desc: 'Tema y color de acento',
  },
  {
    id: 'notificaciones',
    icon: <Bell className="w-4 h-4" />,
    label: 'Notificaciones y alertas',
    desc: 'Sonidos y avisos',
  },
  { id: 'atajos', icon: <Keyboard className="w-4 h-4" />, label: 'Atajos de teclado', desc: 'Productividad' },
];

export const SETTINGS_TAB_IDS = TABS.map((tab) => tab.id);

interface SettingsTabNavProps {
  activeTab: string;
  onTabChange: (id: string) => void;
}

export const SettingsTabNav = memo(function SettingsTabNav({ activeTab, onTabChange }: SettingsTabNavProps) {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const currentTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const tab = currentTabRef.current;
    if (!nav || !tab) return;
    const reveal = () => {
      const frame = nav.getBoundingClientRect();
      const selected = tab.getBoundingClientRect();
      const right = frame.left + nav.clientWidth;
      const bottom = frame.top + nav.clientHeight;
      if (selected.left < frame.left) nav.scrollLeft += selected.left - frame.left - 8;
      else if (selected.right > right) nav.scrollLeft += selected.right - right + 8;
      if (selected.top < frame.top) nav.scrollTop += selected.top - frame.top - 8;
      else if (selected.bottom > bottom) nav.scrollTop += selected.bottom - bottom + 8;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    window.api
      ?.invoke('get-app-version')
      .then(unwrap)
      .then((v: unknown) => {
        if (!cancelled && typeof v === 'string' && v.trim()) setAppVersion(v.trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Secciones de Ajustes"
      className="flex w-full shrink-0 gap-2 overflow-x-auto border-b border-border/30 bg-background p-3 @min-[58rem]/settings-shell:w-60 @min-[58rem]/settings-shell:flex-col @min-[58rem]/settings-shell:overflow-x-hidden @min-[58rem]/settings-shell:overflow-y-auto @min-[58rem]/settings-shell:border-r @min-[58rem]/settings-shell:border-b-0 @min-[58rem]/settings-shell:p-4"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          ref={activeTab === tab.id ? currentTabRef : undefined}
          type="button"
          onClick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          data-native-tab
          data-keep-focus
          className={`group flex min-h-11 min-w-max shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors duration-(--duration-motion-micro) @min-[58rem]/settings-shell:min-w-0 ${
            activeTab === tab.id
              ? 'bg-secondary/70 border-border/60 text-foreground'
              : 'bg-transparent text-muted-foreground border-transparent hover:bg-secondary/60 hover:text-foreground hover:border-border/50'
          }`}
        >
          <span
            className={`shrink-0 transition-colors ${activeTab === tab.id ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {tab.icon}
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight leading-none">{tab.label}</span>
            <span className="sr-only mt-1 text-[11px] leading-snug text-muted-foreground @min-[58rem]/settings-shell:not-sr-only">
              {tab.desc}
            </span>
          </span>
        </button>
      ))}
      {appVersion && (
        <p className="mt-3 hidden text-center text-[11px] text-muted-foreground tabular-nums @min-[58rem]/settings-shell:block">
          OmniAnime v{appVersion}
        </p>
      )}
    </nav>
  );
});

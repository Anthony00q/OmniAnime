import { memo, useEffect, useState } from 'react';
import { HardDrive, Download, Database, Palette, Bell, Keyboard, Info, ScrollText } from 'lucide-react';

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
    desc: 'Velocidad y opciones',
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
    desc: 'Nivel, visor y diagnóstico',
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
    label: 'Notificaciones y Alertas',
    desc: 'Sonidos y avisos',
  },
  { id: 'atajos', icon: <Keyboard className="w-4 h-4" />, label: 'Atajos de Teclado', desc: 'Productividad' },
];

interface SettingsTabNavProps {
  activeTab: string;
  onTabChange: (id: string) => void;
}

export const SettingsTabNav = memo(function SettingsTabNav({ activeTab, onTabChange }: SettingsTabNavProps) {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api
      ?.invoke('get-app-version')
      .then((v: unknown) => {
        if (!cancelled && typeof v === 'string' && v.trim()) setAppVersion(v.trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex w-full shrink-0 gap-2 overflow-x-auto border-b border-border bg-background/50 p-3 sm:p-4 min-[960px]:w-[264px] min-[960px]:flex-col min-[960px]:overflow-visible min-[960px]:border-b-0 min-[960px]:border-r min-[960px]:p-6 min-[960px]:pt-6 backdrop-blur-sm">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={`group flex min-w-max items-center gap-3 rounded-xl px-4 py-3 text-left border transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-[0.98] min-[960px]:min-w-0 ${
            activeTab === tab.id
              ? 'bg-primary/15 border-primary/30 text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
              : 'bg-transparent text-muted-foreground border-transparent hover:bg-secondary/60 hover:text-foreground hover:border-border/50'
          }`}
        >
          <span
            className={`p-1.5 rounded-lg transition-colors ${activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 group-hover:bg-secondary'}`}
          >
            {tab.icon}
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight leading-none">{tab.label}</span>
            <span
              className={`text-[11px] leading-none mt-1 ${activeTab === tab.id ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}
            >
              {tab.desc}
            </span>
          </span>
        </button>
      ))}
      <div className="hidden min-[960px]:block mt-4 rounded-xl bg-secondary/30 border border-border/40 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Info className="w-3.5 h-3.5 text-primary" /> Consejo
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Usa{' '}
          <span className="font-mono text-foreground bg-background px-1 py-0.5 rounded border border-border">
            CTRL+F
          </span>{' '}
          para buscar anime desde cualquier vista.
        </p>
      </div>
      {appVersion && (
        <p className="hidden min-[960px]:block mt-3 text-center text-[11px] text-muted-foreground/70 tabular-nums">
          OmniAnime v{appVersion}
        </p>
      )}
    </div>
  );
});

import { Minus, Square, X, Copy } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Titlebar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.api
      .invoke('get-splash-icon')
      .then((url: unknown) => {
        if (alive && typeof url === 'string' && url.startsWith('data:image')) setIconUrl(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const handleWindowStateChanged = (state: any) => {
      if (isMounted) setIsMaximized(Boolean(state?.isMaximized));
    };

    window.api.on('window-state-changed', handleWindowStateChanged);
    window.api
      .invoke('window-get-state')
      .then((state: any) => handleWindowStateChanged(state))
      .catch(() => undefined);

    return () => {
      isMounted = false;
      window.api.removeListener('window-state-changed', handleWindowStateChanged);
    };
  }, []);

  const handleMinimize = () => window.api.invoke('window-minimize');
  const handleToggleMaximize = () => window.api.invoke('window-toggle-maximize');
  const handleClose = () => window.api.invoke('window-close');

  return (
    <div className="h-10 shrink-0 w-full flex items-center justify-between select-none app-region-drag bg-background/95 border-b border-border/50 z-50">
      <div className="flex items-center px-4 gap-2.5">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            width={18}
            height={18}
            decoding="sync"
            draggable={false}
            className="w-[18px] h-[18px] object-contain shrink-0 select-none"
          />
        ) : (
          <span
            className="w-[18px] h-[18px] rounded-[5px] bg-white/[0.06] border border-white/[0.08] block shrink-0"
            aria-hidden="true"
          />
        )}
        <span className="font-semibold text-sm tracking-tight text-foreground/90 font-['Plus_Jakarta_Sans']">
          OmniAnime
        </span>
      </div>

      <div className="flex items-stretch h-full app-region-no-drag">
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Minimizar ventana"
          className="w-12 h-full inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
        >
          <Minus strokeWidth={1.5} className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restaurar ventana' : 'Maximizar ventana'}
          className="w-12 h-full inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
        >
          {isMaximized ? (
            <Copy strokeWidth={1.5} className="w-4 h-4" />
          ) : (
            <Square strokeWidth={1.5} className="w-[14px] h-[14px]" />
          )}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar ventana"
          className="w-12 h-full inline-flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 focus-visible:ring-inset"
        >
          <X strokeWidth={1.5} className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

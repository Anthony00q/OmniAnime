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
    <div className="absolute inset-x-0 top-0 h-10 flex items-center justify-between select-none app-region-drag bg-transparent z-50">
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

      <div className="flex h-full items-center gap-1 pr-3 app-region-no-drag">
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Minimizar ventana"
          className="h-8 w-10 inline-flex items-center justify-center rounded-md text-foreground/80 hover:bg-white/10 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
        >
          <Minus strokeWidth={2} className="w-[14px] h-[14px] drop-shadow-[0_1px_2px_rgb(0_0_0/0.65)]" />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restaurar ventana' : 'Maximizar ventana'}
          className="h-8 w-10 inline-flex items-center justify-center rounded-md text-foreground/80 hover:bg-white/10 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
        >
          {isMaximized ? (
            <Copy strokeWidth={2} className="w-[13px] h-[13px] drop-shadow-[0_1px_2px_rgb(0_0_0/0.65)]" />
          ) : (
            <Square strokeWidth={2} className="w-[12px] h-[12px] drop-shadow-[0_1px_2px_rgb(0_0_0/0.65)]" />
          )}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar ventana"
          className="h-8 w-10 inline-flex items-center justify-center rounded-md text-foreground/80 hover:bg-destructive hover:text-destructive-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 focus-visible:ring-inset"
        >
          <X strokeWidth={2} className="w-[14px] h-[14px] drop-shadow-[0_1px_2px_rgb(0_0_0/0.65)]" />
        </button>
      </div>
    </div>
  );
}

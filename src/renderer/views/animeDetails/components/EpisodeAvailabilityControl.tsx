import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, TriangleAlert } from 'lucide-react';
import type { AnimeLanguage } from '@/types/anime';

interface EpisodeAvailabilityControlProps {
  lang: AnimeLanguage;
  scopeKey: string;
  isActive?: boolean;
  subLabel: string;
  totalEpisodes: number;
  counts: { available: number; pending: number; errors: number; unsupported: number };
  checking: boolean;
  checkAll: boolean;
  onStop: () => void;
  onCheckRemaining: () => void;
  onRetry: () => void;
}

export function EpisodeAvailabilityControl({
  lang,
  scopeKey,
  isActive,
  subLabel,
  totalEpisodes,
  counts,
  checking,
  checkAll,
  onStop,
  onCheckRemaining,
  onRetry,
}: EpisodeAvailabilityControlProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    const panel = panelRef.current;
    if (panel?.matches(':popover-open')) panel.hidePopover();
  }, []);

  const position = useCallback(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger || !panel.matches(':popover-open')) return;
    const anchor = trigger.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    const top =
      anchor.bottom + 8 + bounds.height <= window.innerHeight - 8 ? anchor.bottom + 8 : anchor.top - bounds.height - 8;
    panel.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8, top)}px`;
    panel.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    close();
    setOpen(false);
  }, [lang, scopeKey, isActive, close]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    const onClose = (event: Event) => {
      event.preventDefault();
      close();
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('close-modals', onClose);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('close-modals', onClose);
    };
  }, [open, close]);

  return (
    <>
      <div className="flex h-8 w-48 shrink-0 items-center">
        {lang === 'DUB' ? (
          <button
            ref={triggerRef}
            type="button"
            popoverTarget="dub-availability-popover"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls="dub-availability-popover"
            aria-label="Ver disponibilidad y opciones de DUB"
            className="relative ml-auto flex h-8 w-auto max-w-full items-center gap-1.5 rounded-lg px-2 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          >
            {(checking || counts.errors > 0) && (
              <span className="flex w-3.5 shrink-0 items-center" aria-hidden="true">
                {checking ? (
                  <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                ) : (
                  <TriangleAlert className="h-3.5 w-3.5" />
                )}
              </span>
            )}
            <span className="min-w-0 truncate">
              {checking
                ? 'Comprobando DUB'
                : counts.available > 0
                  ? `${counts.available} ${counts.available === 1 ? 'disponible' : 'disponibles'} en DUB`
                  : counts.errors > 0
                    ? 'Sin verificar'
                    : counts.pending > 0
                      ? 'Sin comprobar'
                      : counts.unsupported > 0
                        ? 'Sin servidor compatible'
                        : 'Sin DUB'}
            </span>
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          </button>
        ) : (
          <span className="flex h-8 w-full items-center justify-end px-2 text-xs font-medium tabular-nums text-muted-foreground">
            <span className="min-w-0 truncate">{subLabel}</span>
          </span>
        )}
      </div>
      {lang === 'DUB' && (
        <>
          <p id="dub-availability-note" className="sr-only" role="status" aria-live="polite">
            {checking ? 'Comprobando DUB. ' : ''}
            {counts.available} disponibles, {counts.pending} sin comprobar, {counts.errors} sin verificar y{' '}
            {counts.unsupported} sin servidor compatible. Solo puedes seleccionar episodios comprobados y compatibles.
          </p>
          <div
            ref={panelRef}
            id="dub-availability-popover"
            popover="auto"
            role="dialog"
            aria-label="Disponibilidad DUB"
            tabIndex={-1}
            onBeforeToggle={(event) => {
              if (event.newState === 'open') requestAnimationFrame(position);
            }}
            onToggle={(event) => setOpen(event.newState === 'open')}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              event.stopPropagation();
              close();
              triggerRef.current?.focus({ preventScroll: true });
            }}
            className={`fixed inset-auto z-[80] m-0 max-h-[calc(100dvh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-border bg-popover p-4 text-foreground shadow-2xl ${open ? 'disable-shortcuts' : ''}`}
          >
            <h4 className="mb-3 text-sm font-semibold">Disponibilidad DUB</h4>
            <dl className="space-y-2 text-xs text-muted-foreground">
              {[
                ['Disponibles', counts.available],
                ['Sin DUB', totalEpisodes - counts.available - counts.pending - counts.errors - counts.unsupported],
                ['Sin comprobar', counts.pending],
                ['Sin verificar', counts.errors],
                ['Sin servidor compatible', counts.unsupported],
              ].map(([label, count]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt>{label}</dt>
                  <dd className="font-medium tabular-nums text-foreground">{count}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Solo puedes seleccionar episodios comprobados y compatibles.
            </p>
            {(checking || checkAll || counts.pending > 0 || counts.errors > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(checking || checkAll
                  ? [{ label: 'Detener', action: onStop }]
                  : [
                      ...(counts.pending > 0 ? [{ label: 'Comprobar todos', action: onCheckRemaining }] : []),
                      ...(counts.errors > 0 ? [{ label: 'Reintentar', action: onRetry }] : []),
                    ]
                ).map(({ label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      action();
                      close();
                      triggerRef.current?.focus({ preventScroll: true });
                    }}
                    className="min-h-11 rounded-lg bg-secondary px-3 text-xs font-medium transition-colors hover:bg-surface-elevated"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

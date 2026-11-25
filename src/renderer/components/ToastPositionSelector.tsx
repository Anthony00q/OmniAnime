import { Bell, Minus, Square, X } from 'lucide-react';

const positions = [
  ['top-left', 'Arriba a la izquierda'],
  ['top-center', 'Arriba al centro'],
  ['top-right', 'Arriba a la derecha'],
  ['bottom-left', 'Abajo a la izquierda'],
  ['bottom-center', 'Abajo al centro'],
  ['bottom-right', 'Abajo a la derecha'],
] as const;

type ToastPosition = (typeof positions)[number][0];

interface ToastPositionSelectorProps {
  value: ToastPosition;
  onChange: (value: ToastPosition) => void;
}

export function ToastPositionSelector({ value, onChange }: ToastPositionSelectorProps) {
  return (
    <div className="@container/alert-preview overflow-hidden rounded-lg border border-border/70 bg-background select-none">
      <div
        aria-hidden="true"
        className="flex h-7 items-center gap-2.5 border-b border-border/50 bg-surface px-3 text-muted-foreground"
      >
        <span className="mr-auto text-[11px] font-medium">OmniAnime</span>
        <Minus className="size-2.5" />
        <Square className="size-2.5" />
        <X className="size-2.5" />
      </div>
      <div
        role="group"
        aria-label="Posición de alertas internas"
        className="grid min-h-32 grid-cols-3 content-between gap-x-1.5 gap-y-6 p-2 @[17rem]/alert-preview:min-h-36"
      >
        {positions.map(([position, label]) => {
          const selected = value === position;
          return (
            <button
              key={position}
              type="button"
              onClick={() => onChange(position)}
              aria-label={`Seleccionar posición ${label}`}
              aria-pressed={selected}
              data-native-tab
              data-keep-focus
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1 text-xs font-medium transition-colors duration-(--duration-motion-micro) ${
                selected
                  ? 'border-primary/50 bg-surface-elevated text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border-strong hover:bg-surface hover:text-foreground'
              }`}
            >
              {selected ? (
                <>
                  <Bell className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span aria-hidden="true" className="hidden @[17rem]/alert-preview:inline">
                    Alerta
                  </span>
                </>
              ) : (
                <span aria-hidden="true" className="h-1 w-5 rounded-full bg-current opacity-50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

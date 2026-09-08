import { memo } from 'react';
import { X } from 'lucide-react';
import { AppTooltip } from '../../../components/ui/AppTooltip';

interface SettingsHeaderProps {
  isDirty: boolean;
  onDiscard: () => void;
}

export const SettingsHeader = memo(function SettingsHeader({ isDirty, onDiscard }: SettingsHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-sm p-4 pb-4 sm:p-8 sm:pb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Configuración</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajusta OmniAnime a tu medida — los cambios requieren guardar.
          </p>
        </div>
        {isDirty && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 pl-3 pr-1 py-1 text-xs font-semibold text-amber-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Cambios sin guardar
            <AppTooltip content="Descartar cambios" side="bottom">
              <button
                type="button"
                onClick={onDiscard}
                aria-label="Descartar cambios sin guardar"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-500/70 transition-colors hover:bg-amber-500/20 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </AppTooltip>
          </span>
        )}
      </div>
    </div>
  );
});

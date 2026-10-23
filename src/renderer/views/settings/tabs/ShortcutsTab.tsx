import { memo } from 'react';
import { toast } from 'sonner';
import { Keyboard, Layers, RotateCcw, X } from 'lucide-react';

const RESERVED_SEARCH_KEYS = new Set(['A', 'C', 'V', 'X', 'Z', 'Y', 'W', 'R']);

interface ShortcutsTabProps {
  settings: any;
  onChange: (key: string, value: any, category?: string) => void;
}

export const ShortcutsTab = memo(function ShortcutsTab({ settings, onChange }: ShortcutsTabProps) {
  return (
    <div className="space-y-6">
      <section className="settings-section">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="settings-section-icon">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Atajos de teclado</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                No funcionan mientras escribes en un campo de texto.
              </p>
            </div>
          </div>

          <div className="flex flex-col mt-5">
            <div className="settings-option-row grid min-w-0 grid-cols-1 gap-3 py-4 @xl/settings:grid-cols-[minmax(0,1fr)_auto] @xl/settings:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="p-2 shrink-0">
                  <Keyboard className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold leading-snug">
                    Buscar anime
                    <span className="text-[11px] font-medium text-muted-foreground">Editable</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                    Abre el buscador de Inicio o Catálogo.
                  </p>
                </div>
              </div>
              <div className="pl-11 @xl/settings:min-w-40 @xl/settings:justify-self-end @xl/settings:pl-0">
                <div className="flex items-center gap-2 @xl/settings:justify-end">
                  <kbd className="inline-flex h-9 items-center px-2.5 bg-secondary/40 border border-border rounded-lg text-xs font-semibold">
                    CTRL
                  </kbd>
                  <span className="text-muted-foreground">+</span>
                  <label className="relative">
                    <input
                      aria-label="Atajo de teclado para buscar"
                      type="text"
                      maxLength={1}
                      value={settings.shortcuts?.search || 'F'}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        if (v.length > 1) return;
                        const next = v || 'F';
                        if (RESERVED_SEARCH_KEYS.has(next)) {
                          toast.error('Esa tecla está reservada (copiar, pegar…). Elige otra.');
                          return;
                        }
                        onChange('search', next, 'shortcuts');
                      }}
                      onFocus={(e) => e.target.select()}
                      className="field-input w-10 h-9 text-center bg-surface border border-border rounded-lg text-sm font-semibold focus:outline-none uppercase"
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground @xl/settings:text-right">Una letra o número</p>
              </div>
            </div>

            <div className="settings-option-row grid min-w-0 grid-cols-1 gap-3 py-4 @xl/settings:grid-cols-[minmax(0,1fr)_auto] @xl/settings:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="p-2 shrink-0">
                  <X className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-snug">Cerrar diálogos / Salir</div>
                  <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                    Cierra diálogos o suelta el campo de texto.
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">Fija: no se puede cambiar.</p>
                </div>
              </div>
              <div className="pl-11 @xl/settings:min-w-40 @xl/settings:justify-self-end @xl/settings:pl-0 @xl/settings:text-right">
                <kbd className="inline-flex h-9 min-w-9 items-center justify-center px-2.5 bg-secondary/40 border border-border rounded-lg text-xs font-semibold">
                  ESC
                </kbd>
              </div>
            </div>

            <div className="settings-option-row grid min-w-0 grid-cols-1 gap-3 py-4 @xl/settings:grid-cols-[minmax(0,1fr)_auto] @xl/settings:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="p-2 shrink-0">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-snug">Cambiar de vista</div>
                  <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                    Muévete entre secciones con ← y →.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    <span className="text-xs text-muted-foreground">← Anterior</span>
                    <span className="text-xs text-muted-foreground">→ Siguiente</span>
                  </div>
                </div>
              </div>
              <div
                className="flex items-center gap-2 pl-11 @xl/settings:min-w-40 @xl/settings:justify-end @xl/settings:justify-self-end @xl/settings:pl-0"
                aria-label="Flechas izquierda y derecha"
              >
                <kbd className="inline-flex h-9 min-w-9 items-center justify-center px-2.5 bg-secondary/40 border border-border rounded-lg text-xs font-semibold">
                  ←
                </kbd>
                <kbd className="inline-flex h-9 min-w-9 items-center justify-center px-2.5 bg-secondary/40 border border-border rounded-lg text-xs font-semibold">
                  →
                </kbd>
              </div>
            </div>
          </div>
          <div className="flex justify-end border-t border-border/40 pt-4">
            <button
              type="button"
              onClick={() => {
                onChange('search', 'F', 'shortcuts');
                onChange('close', 'Escape', 'shortcuts');
                onChange('prevView', 'ArrowLeft', 'shortcuts');
                onChange('nextView', 'ArrowRight', 'shortcuts');
              }}
              className="shrink-0 inline-flex min-h-11 items-center gap-1.5 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restablecer atajos
            </button>
          </div>
        </div>
      </section>
    </div>
  );
});

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
      <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/10">
              <Keyboard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Atajos de Teclado</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Atajos disponibles en la app, menos cuando estás escribiendo.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-5">
            <div className="group relative rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 hover:border-primary/30 transition-colors">
              <div className="absolute top-3 right-3 text-[11px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                Editable
              </div>
              <div className="flex items-start gap-3 pr-12">
                <div className="p-2 bg-background rounded-xl border border-border shadow-sm shrink-0">
                  <Keyboard className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-tight">Buscar anime</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Enfoca el buscador de Inicio o Catálogo.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <kbd className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-mono font-bold shadow-sm">
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
                        toast.error('Esa letra choca con copiar/pegar y otros atajos. Elige otra.');
                        return;
                      }
                      onChange('search', next, 'shortcuts');
                    }}
                    onFocus={(e) => e.target.select()}
                    className="w-10 h-9 text-center bg-background border-2 border-primary/30 rounded-xl text-sm font-mono font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 uppercase shadow-sm"
                  />
                </label>
                <span className="text-xs text-muted-foreground ml-1">Una letra o número</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-background p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-secondary rounded-xl border border-border/50 shrink-0">
                  <X className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-tight">Cerrar modales / Salir</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Cierra diálogos, detalles o la app según el contexto.
                  </p>
                </div>
                <kbd className="shrink-0 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs font-mono font-bold shadow-sm">
                  ESC
                </kbd>
              </div>
              <div className="mt-4 rounded-xl bg-secondary/30 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
                Fijo por ahora para no chocar con el cierre de ventana.
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-background p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-secondary rounded-xl border border-border/50 shrink-0">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold leading-tight">Cambiar de vista</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Cambia de sección con ← y →.</p>
                </div>
                <kbd className="shrink-0 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs font-mono font-bold shadow-sm">
                  ← →
                </kbd>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="px-2 py-1 bg-secondary border border-border rounded-full text-[11px] font-medium">
                  ← Anterior
                </span>
                <span className="px-2 py-1 bg-secondary border border-border rounded-full text-[11px] font-medium">
                  → Siguiente
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-background p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">Restablecer configuración de atajos</div>
                <button
                  type="button"
                  onClick={() => {
                    onChange('search', 'F', 'shortcuts');
                    onChange('close', 'Escape', 'shortcuts');
                    onChange('prevView', 'ArrowLeft', 'shortcuts');
                    onChange('nextView', 'ArrowRight', 'shortcuts');
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restablecer
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
});

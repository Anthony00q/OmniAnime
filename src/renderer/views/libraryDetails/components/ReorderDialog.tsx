import { AlertTriangle, Check, ArrowRight, Eye, ListOrdered, Minus, Plus, Hash, Info, Loader2 } from 'lucide-react';
import { Dialog } from '../../../components/Dialog';
import { AppTooltip } from '../../../components/ui/AppTooltip';

interface ReorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reorderStart: string;
  onReorderStartChange: (value: string) => void;
  reorderStartNum: number;
  isInputPending: boolean;
  reorderPreview: any;
  isFetching: boolean;
  isPending: boolean;
  onConfirm: () => void;
}

export function ReorderDialog({
  open,
  onOpenChange,
  reorderStart,
  onReorderStartChange,
  reorderStartNum,
  isInputPending,
  reorderPreview,
  isFetching,
  isPending,
  onConfirm,
}: ReorderDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Renumerar episodios"
      message="Elige desde qué número empieza el primer archivo. Ideal para segundas temporadas o continuaciones."
      confirmLabel={
        isFetching
          ? 'Calculando…'
          : reorderPreview?.summary?.toRename === 0
            ? 'Sin cambios'
            : `Renumerar · ${reorderPreview?.summary?.toRename ?? '—'} cambio(s)`
      }
      confirmDisabled={
        isFetching ||
        isPending ||
        !Number.isFinite(reorderStartNum) ||
        reorderStartNum < 0 ||
        (reorderPreview ? reorderPreview.summary.toRename === 0 : false)
      }
      confirmLoading={isPending}
      icon={<ListOrdered className="w-5 h-5 text-primary" />}
      className="max-w-[640px]"
      onConfirm={onConfirm}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3.5">
          <label className="block text-xs font-bold tracking-widest uppercase text-muted-foreground mb-2.5">
            Número inicial
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const n = parseInt(reorderStart, 10);
                const next = isNaN(n) ? 1 : Math.max(0, n - 1);
                onReorderStartChange(String(next));
              }}
              className="w-11 h-11 rounded-xl bg-background border border-border flex items-center justify-center hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 shrink-0"
              aria-label="Decrementar"
            >
              <Minus className="w-4 h-4" />
            </button>

            <div className="flex-1 relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="number"
                min={0}
                value={reorderStart}
                onChange={(e) => onReorderStartChange(e.target.value)}
                className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-3 text-base font-mono font-semibold text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-center"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const n = parseInt(reorderStart, 10);
                const next = isNaN(n) ? 1 : n + 1;
                onReorderStartChange(String(next));
              }}
              className="w-11 h-11 rounded-xl bg-primary text-primary-foreground border border-primary flex items-center justify-center hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 shrink-0 shadow-sm"
              aria-label="Incrementar"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="text-xs text-muted-foreground py-1 pr-1">Atajos:</span>
            {[1, 13, 25, 37].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onReorderStartChange(String(n))}
                aria-pressed={reorderStartNum === n}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  reorderStartNum === n
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border hover:bg-secondary text-foreground'
                }`}
              >
                {n === 1 ? 'S01 · 1' : n === 13 ? 'S02 · 13' : n === 25 ? 'S03 · 25' : `S04 · ${n}`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onReorderStartChange('0')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${reorderStartNum === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-secondary'}`}
            >
              0
            </button>
          </div>

          <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed flex gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Se ordena por número detectado (anitomy) y luego alfabéticamente. El estilo{' '}
              {reorderPreview?.inferredStyle === 'minimal'
                ? 'Minimalista (EP_)'
                : reorderPreview?.inferredStyle === 'descriptive'
                  ? 'Descriptivo (Título EP_)'
                  : 'actual'}{' '}
              se conservará.
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-background overflow-hidden flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/50 bg-secondary/20 shrink-0">
            <span className="text-xs font-bold tracking-widest uppercase text-muted-foreground flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Vista previa
            </span>
            <span
              className={`text-xs text-muted-foreground inline-flex items-center gap-1.5 transition-opacity duration-150 ease-out ${isFetching || isInputPending ? 'opacity-60' : 'opacity-100'}`}
            >
              {reorderPreview?.success ? (
                <>
                  {reorderPreview.summary.total} archivos · {reorderPreview.summary.toRename} por cambiar
                  {(isFetching || isInputPending) && (
                    <Loader2 className="w-3 h-3 animate-spin ml-1" aria-hidden="true" />
                  )}
                </>
              ) : isFetching || isInputPending ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Calculando…
                </>
              ) : null}
            </span>
          </div>

          <div className="relative flex-1 flex flex-col min-h-[220px]">
            {reorderPreview?.success === false ? (
              <div className="flex flex-1 items-center justify-center px-4 py-10 text-center">
                <div>
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{reorderPreview?.error || 'No se pudo previsualizar'}</p>
                </div>
              </div>
            ) : !reorderPreview && (isFetching || isInputPending) ? (
              <div className="flex flex-1 items-center justify-center py-10">
                <div className="flex flex-col items-center gap-2.5">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Calculando vista previa…</span>
                </div>
              </div>
            ) : reorderPreview && reorderPreview.items.length > 0 ? (
              <>
                <div className="flex gap-1.5 px-3.5 py-2.5 bg-secondary/10 border-b border-border/50 shrink-0 transition-opacity duration-150 ease-out">
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary border border-primary/15 px-2 py-1 rounded-full">
                    <ListOrdered className="w-3 h-3" /> {reorderPreview.summary.toRename} renombrado(s)
                  </span>
                  {reorderPreview.summary.unchanged > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-secondary border border-border px-2 py-1 rounded-full text-muted-foreground">
                      <Check className="w-3 h-3" /> {reorderPreview.summary.unchanged} sin cambio
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
                    EP_{reorderPreview.startNumber} → EP_
                    {reorderPreview.startNumber + reorderPreview.summary.total - 1}
                  </span>
                </div>

                <div
                  className={`max-h-56 overflow-y-auto custom-scrollbar divide-y divide-border/40 flex-1 transition-opacity duration-150 ease-out ${isFetching || isInputPending ? 'opacity-60' : 'opacity-100'}`}
                >
                  {reorderPreview.items.map((item: any, idx: number) => (
                    <div
                      key={`${item.from}-${idx}`}
                      className={`flex items-center gap-2 px-3 py-2 text-xs ${item.status === 'will_rename' ? 'bg-primary/[0.03]' : ''}`}
                    >
                      <span className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 font-mono text-[11px] font-bold text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <AppTooltip content={item.from}>
                          <span
                            className={`truncate w-fit max-w-full font-mono text-xs px-1.5 py-1 rounded border ${item.status === 'will_rename' ? 'bg-secondary/50 border-border/40 line-through opacity-60' : 'bg-secondary/40 border-border/30'}`}
                          >
                            {item.from}
                          </span>
                        </AppTooltip>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <AppTooltip content={item.to}>
                          <span
                            className={`truncate w-fit max-w-full font-mono text-xs px-1.5 py-1 rounded border font-medium ${item.status === 'will_rename' ? 'bg-primary/10 border-primary/20 text-foreground' : 'bg-secondary/30 border-border/30'}`}
                          >
                            {item.to}
                          </span>
                        </AppTooltip>
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono bg-secondary border border-border px-1.5 py-0.5 rounded shrink-0">
                        EP_{item.toEpisodeNumber}
                      </span>
                    </div>
                  ))}
                </div>
                {(isFetching || isInputPending) && (
                  <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-start justify-center pt-10 z-10 pointer-events-none animate-in fade-in duration-150">
                    <span className="inline-flex items-center gap-2 rounded-full bg-secondary/90 border border-border px-3 py-1 text-xs font-medium shadow-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Actualizando…
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
                {Number.isFinite(reorderStartNum)
                  ? 'No hay archivos para previsualizar.'
                  : 'Introduce un número válido.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

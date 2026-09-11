import { memo } from 'react';
import { BarChart3, Database, Eraser, Eye, HardDrive, Loader2, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppTooltip } from '../../../components/ui/AppTooltip';

interface StorageTabProps {
  storageStatsQuery: any;
  storageActions: any;
  formatBytes: (bytes: number) => string;
  formatDiskPercent: (free: number | null, total: number | null) => number | null;
}

export const StorageTab = memo(function StorageTab({
  storageStatsQuery,
  storageActions,
  formatBytes,
  formatDiskPercent,
}: StorageTabProps) {
  return (
    <>
      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Estado de Almacenamiento</h3>
        </div>

        {storageStatsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8" role="status" aria-label="Cargando almacenamiento">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : storageStatsQuery.isError ? (
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
            <span>No se pudo leer el almacenamiento.</span>
            <button
              type="button"
              onClick={() => storageStatsQuery.refetch()}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold"
            >
              Reintentar
            </button>
          </div>
        ) : !storageStatsQuery.data ? (
          <div className="flex items-center justify-center py-8" role="status" aria-label="Cargando almacenamiento">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className={`space-y-4 ${storageStatsQuery.isFetching && !storageStatsQuery.data ? 'opacity-60' : ''}`}>
            {(storageStatsQuery.data as any)?.disks?.length > 0 && (
              <div className="space-y-2.5">
                {(storageStatsQuery.data as any).disks.map((d: any, idx: number) => {
                  const pct = formatDiskPercent(d.free, d.total);
                  const freeText = d.free != null ? formatBytes(d.free) : '—';
                  const totalText = d.total != null ? formatBytes(d.total) : '—';
                  const usedText = d.free != null && d.total != null ? formatBytes(d.total - d.free) : null;
                  return (
                    <div key={idx} className="rounded-xl border border-border/60 bg-background p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex gap-3">
                          <div className="w-8 h-8 flex items-center justify-center bg-secondary rounded-lg border border-border/50 shrink-0">
                            <HardDrive className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{d.label}</div>
                            <div className="text-xs text-muted-foreground truncate select-text">{d.path}</div>
                            {d.error ? (
                              <div className="text-[11px] text-amber-600 mt-1">{d.error}</div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                {usedText ? `${usedText} usados` : ''} {usedText && totalText ? '·' : ''} {totalText}{' '}
                                total · {freeText} libres
                              </div>
                            )}
                          </div>
                        </div>
                        {pct != null && (
                          <span
                            className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full border ${pct > 85 ? 'bg-destructive/10 text-destructive-fg border-destructive/20' : pct > 70 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'}`}
                          >
                            {pct}% usado
                          </span>
                        )}
                      </div>
                      {pct != null && (
                        <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden border border-border/40">
                          <div
                            className={`h-full rounded-full origin-left transition-[transform,background-color] ${pct > 85 ? 'bg-destructive' : pct > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                            style={{ width: '100%', transform: `scaleX(${pct / 100})` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/60 bg-background p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-muted-foreground mb-2">
                  <Database className="w-3.5 h-3.5" /> Datos guardados
                </div>
                {(() => {
                  const db = (storageStatsQuery.data as any)?.db;
                  if (!db) return <div className="text-xs text-muted-foreground">—</div>;
                  return (
                    <>
                      <div className="text-sm font-mono font-semibold">{formatBytes(db.total)}</div>
                      <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        Información de tu biblioteca y ajustes
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="rounded-xl border border-border/60 bg-background p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-muted-foreground mb-2">
                  <Eraser className="w-3.5 h-3.5" /> Archivos temporales
                </div>
                {(() => {
                  const cache = (storageStatsQuery.data as any)?.cache;
                  if (!cache) return <div className="text-xs text-muted-foreground">—</div>;
                  const isEmpty = cache.count === 0;
                  return (
                    <>
                      <div
                        className={`text-sm font-semibold ${isEmpty ? 'text-muted-foreground' : 'font-mono text-foreground'}`}
                      >
                        {isEmpty ? 'Vacío' : `${cache.count} archivos · ${formatBytes(cache.size)}`}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {isEmpty ? 'No hay restos de descargas' : 'Restos de descargas que no terminaron'}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="rounded-xl border border-border/60 bg-background p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-muted-foreground mb-2">
                  <Eye className="w-3.5 h-3.5" /> Vistas previas
                </div>
                {(() => {
                  const th = (storageStatsQuery.data as any)?.thumbnails;
                  if (!th) return <div className="text-xs text-muted-foreground">—</div>;
                  const isEmpty = th.count === 0;
                  return (
                    <>
                      <div
                        className={`text-sm font-semibold ${isEmpty ? 'text-muted-foreground' : 'font-mono text-foreground'}`}
                      >
                        {isEmpty ? 'Vacío' : `${th.count} imágenes · ${formatBytes(th.size)}`}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {isEmpty
                          ? 'Sin vistas previas'
                          : th.expiredCount > 0
                            ? `${th.expiredCount} antiguas (más de 30 días)`
                            : 'Todas están al día'}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="flex min-h-[28px] items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              {storageStatsQuery.isFetching && (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Actualizando...
                </>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Trash2 className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Limpieza</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-secondary rounded-lg border border-border/50 shrink-0">
                <Eraser className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Archivos temporales</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Borra los restos que quedan cuando una descarga no termina. No afecta lo que estás descargando ahora.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const toastId = toast.loading('Limpiando archivos temporales...');
                try {
                  const res: any = await storageActions.cleanCache.mutateAsync();
                  if (res.cleaned > 0)
                    toast.success(`Se limpiaron ${res.cleaned} archivos (${formatBytes(res.freed)})`, { id: toastId });
                  else toast.success('No había nada para limpiar', { id: toastId });
                } catch (e: any) {
                  toast.error('No se pudieron limpiar los archivos', {
                    id: toastId,
                    description: String(e?.message || e),
                  });
                }
              }}
              disabled={storageActions.cleanCache.isPending}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
            >
              {storageActions.cleanCache.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Limpiar archivos temporales
            </button>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-secondary rounded-lg border border-border/50 shrink-0">
                <Eye className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">Vistas previas antiguas</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Elimina las imágenes previas que ya no usas. Se crean de nuevo solas cuando vuelves a ver el video.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const toastId = toast.loading('Limpiando vistas previas...');
                  try {
                    const res: any = await storageActions.cleanThumbnails.mutateAsync('expired');
                    if (res.cleaned > 0)
                      toast.success(`Se limpiaron ${res.cleaned} imágenes (${formatBytes(res.freed)})`, {
                        id: toastId,
                      });
                    else toast.success('No había vistas previas antiguas', { id: toastId });
                  } catch (e: any) {
                    toast.error('No se pudieron limpiar las vistas previas', {
                      id: toastId,
                      description: String(e?.message || e),
                    });
                  }
                }}
                disabled={storageActions.cleanThumbnails.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
              >
                {storageActions.cleanThumbnails.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eraser className="w-4 h-4" />
                )}
                Limpiar antiguas
              </button>
              <AppTooltip content="Borrar todas las vistas previas">
                <span className="inline-flex">
                  <button
                    type="button"
                    onClick={async () => {
                      const toastId = toast.loading('Borrando todas las vistas previas...');
                      try {
                        const res: any = await storageActions.cleanThumbnails.mutateAsync('all');
                        if (res.cleaned > 0)
                          toast.success(`Se borraron ${res.cleaned} imágenes (${formatBytes(res.freed)})`, {
                            id: toastId,
                          });
                        else toast.success('No había vistas previas', { id: toastId });
                      } catch (e: any) {
                        toast.error('No se pudieron borrar', {
                          id: toastId,
                          description: String(e?.message || e),
                        });
                      }
                    }}
                    disabled={storageActions.cleanThumbnails.isPending}
                    className="px-3.5 py-2 bg-background hover:bg-secondary border border-border rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Limpiar todas
                  </button>
                </span>
              </AppTooltip>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-500" /> No se borra nada de lo que estás descargando ahora.
        </p>
      </section>
    </>
  );
});

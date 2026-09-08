import { AlertTriangle, Check, ArrowRight, Eye, Wand2, Sparkles, Loader2 } from 'lucide-react';
import { Dialog } from '../../../components/Dialog';
import { AppTooltip } from '../../../components/ui/AppTooltip';

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  folderName?: string; // kept for compatibility, used as fallback for preview
  renameStyle: 'minimal' | 'descriptive';
  onStyleChange: (style: 'minimal' | 'descriptive') => void;
  autoRename: boolean;
  globalStyle: 'minimal' | 'descriptive';
  renamePreview: any;
  isFetching: boolean;
  isError: boolean;
  isPending: boolean;
  onConfirm: () => void;
}

export function RenameDialog({
  open,
  onOpenChange,
  title,
  folderName,
  renameStyle,
  onStyleChange,
  autoRename,
  globalStyle,
  renamePreview,
  isFetching,
  isError,
  isPending,
  onConfirm,
}: RenameDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Forzar renombrado de archivos"
      message="Elige el estilo y revisa la vista previa antes de aplicar. Solo afecta a esta carpeta."
      confirmLabel={
        isFetching
          ? 'Calculando…'
          : renamePreview?.summary?.toRename === 0
            ? 'Sin cambios'
            : `Aplicar estilo · ${renamePreview?.summary?.toRename ?? '—'} cambio(s)`
      }
      confirmDisabled={isFetching || isPending || (renamePreview ? renamePreview.summary.toRename === 0 : false)}
      confirmLoading={isPending}
      icon={<Wand2 className="w-5 h-5 text-primary" />}
      className="max-w-[640px]"
      onConfirm={onConfirm}
    >
      <div className="space-y-4">
        {autoRename && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 flex gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-500 leading-none">
                Auto-renombrado activo en Ajustes
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Normalmente los archivos se normalizan solos al abrir la carpeta. Este forzado aplica el estilo elegido
                <span className="font-medium text-foreground"> solo aquí y ahora</span>, sin cambiar el ajuste global.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary border border-border px-2.5 py-1">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Global: <span className="font-semibold">{globalStyle === 'minimal' ? 'Minimalista' : 'Descriptivo'}</span>
          </span>
          <span className="text-muted-foreground">
            Se usará{' '}
            <span className="font-medium text-foreground">{renameStyle === 'minimal' ? 'EP_01' : 'Título EP_01'}</span>{' '}
            para esta carpeta.
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              id: 'descriptive' as const,
              title: 'Descriptivo',
              mono: `${(renamePreview?.folderName || folderName || title || 'Título').slice(0, 28)} EP_01.mp4`,
              desc: 'Incluye título, ideal para identificar.',
            },
            {
              id: 'minimal' as const,
              title: 'Minimalista',
              mono: 'EP_01.mp4 · EP_12.mp4',
              desc: 'Solo número, librería limpia.',
            },
          ].map((opt) => (
            <label
              key={opt.id}
              className={`relative flex flex-col gap-2 p-3.5 rounded-xl border cursor-pointer transition-colors duration-150 ease-out text-left ${
                renameStyle === opt.id
                  ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20'
                  : 'border-border bg-secondary/20 hover:bg-secondary/40 hover:border-border-strong'
              }`}
            >
              <input
                type="radio"
                name="renameStyle"
                checked={renameStyle === opt.id}
                onChange={() => onStyleChange(opt.id)}
                className="sr-only"
              />
              <span className="flex items-center gap-2">
                <span
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${renameStyle === opt.id ? 'border-primary bg-primary' : 'border-border bg-background'}`}
                >
                  {renameStyle === opt.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <span className="text-sm font-bold">{opt.title}</span>
                {renameStyle === opt.id && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold tracking-widest uppercase bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                    <Check className="w-3 h-3" /> Activo
                  </span>
                )}
              </span>
              <AppTooltip content={opt.mono}>
                <span className="font-mono text-xs bg-background border border-border/60 rounded-lg px-2.5 py-1.5 truncate w-fit max-w-full">
                  {opt.mono}
                </span>
              </AppTooltip>
              <span className="text-[11px] text-muted-foreground leading-relaxed">{opt.desc}</span>
            </label>
          ))}
        </div>

        <div className="rounded-xl border border-border/60 bg-background overflow-hidden flex flex-col min-h-[280px]">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/50 bg-secondary/20 shrink-0">
            <span className="text-xs font-bold tracking-widest uppercase text-muted-foreground flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Vista previa
            </span>
            <span
              className={`text-xs text-muted-foreground inline-flex items-center gap-1.5 transition-opacity duration-150 ease-out ${isFetching ? 'opacity-60' : 'opacity-100'}`}
            >
              {renamePreview?.success ? (
                <>
                  {renamePreview.summary.total} archivos · {renamePreview.summary.toRename} por renombrar
                  {isFetching && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-1" aria-hidden="true" />
                  )}
                </>
              ) : isFetching ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Calculando…
                </>
              ) : null}
            </span>
          </div>

          <div className="relative flex-1 flex flex-col min-h-[220px]">
            {isError || renamePreview?.success === false ? (
              <div className="flex flex-1 items-center justify-center px-4 py-10 text-center">
                <div>
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{renamePreview?.error || 'No se pudo previsualizar'}</p>
                </div>
              </div>
            ) : !renamePreview && isFetching ? (
              <div className="flex flex-1 items-center justify-center py-10">
                <div className="flex flex-col items-center gap-2.5">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Calculando vista previa…</span>
                </div>
              </div>
            ) : renamePreview && renamePreview.items.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5 bg-secondary/10 border-b border-border/50 transition-opacity duration-150 ease-out">
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary border border-primary/15 px-2 py-1 rounded-full">
                    <Wand2 className="w-3 h-3" /> {renamePreview.summary.toRename} renombrado(s)
                  </span>
                  {renamePreview.summary.alreadyCorrect > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/15 px-2 py-1 rounded-full">
                      <Check className="w-3 h-3" /> {renamePreview.summary.alreadyCorrect} ya correcto(s)
                    </span>
                  )}
                  {renamePreview.summary.conflicts > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-1 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> {renamePreview.summary.conflicts} conflicto(s)
                    </span>
                  )}
                  {renamePreview.summary.skippedNoNumber > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-secondary border border-border px-2 py-1 rounded-full text-muted-foreground">
                      {renamePreview.summary.skippedNoNumber} sin número
                    </span>
                  )}
                </div>

                <div
                  className={`max-h-56 overflow-y-auto custom-scrollbar divide-y divide-border/40 flex-1 transition-opacity duration-150 ease-out ${isFetching ? 'opacity-60' : 'opacity-100'}`}
                >
                  {renamePreview.items.map((item: any, idx: number) => (
                    <div
                      key={`${item.from}-${idx}`}
                      className={`flex items-center gap-2 px-3 py-2 text-xs ${
                        item.status === 'will_rename'
                          ? 'bg-primary/[0.04]'
                          : item.status === 'conflict'
                            ? 'bg-amber-500/[0.04]'
                            : ''
                      }`}
                    >
                      <AppTooltip content={item.status}>
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold border ${
                            item.status === 'will_rename'
                              ? 'bg-primary text-primary-foreground border-primary'
                              : item.status === 'already_correct'
                                ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20'
                                : item.status === 'conflict'
                                  ? 'bg-amber-500/15 text-amber-600 border-amber-500/20'
                                  : 'bg-secondary text-muted-foreground border-border'
                          }`}
                        >
                          {item.status === 'will_rename' ? (
                            <ArrowRight className="w-3 h-3" />
                          ) : item.status === 'already_correct' ? (
                            <Check className="w-3 h-3" />
                          ) : item.status === 'conflict' ? (
                            '!'
                          ) : (
                            '?'
                          )}
                        </span>
                      </AppTooltip>
                      <span className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <AppTooltip content={item.from}>
                          <span
                            className={`truncate w-fit max-w-full font-mono text-xs px-1.5 py-1 rounded bg-secondary/50 border border-border/40 ${item.status === 'will_rename' ? 'line-through opacity-60' : ''}`}
                          >
                            {item.from}
                          </span>
                        </AppTooltip>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <AppTooltip content={item.to}>
                          <span
                            className={`truncate w-fit max-w-full font-mono text-xs px-1.5 py-1 rounded border ${item.status === 'will_rename' ? 'bg-primary/10 border-primary/20 text-foreground font-medium' : item.status === 'conflict' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-secondary/30 border-border/30'}`}
                          >
                            {item.to}
                          </span>
                        </AppTooltip>
                      </span>
                      <span className="hidden sm:inline-flex text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary border border-border shrink-0">
                        {item.ext || 'mp4'}
                      </span>
                    </div>
                  ))}
                </div>
                {renamePreview.summary.conflicts > 0 && (
                  <div className="px-3 py-2 bg-amber-500/5 border-t border-amber-500/10 text-xs text-amber-700 dark:text-amber-400 flex gap-1.5 shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Los conflictos se omiten para evitar sobrescribir. Renombra manualmente esos archivos si es
                      necesario.
                    </span>
                  </div>
                )}
                {isFetching && (
                  <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] flex items-start justify-center pt-10 z-10 pointer-events-none animate-in fade-in duration-150">
                    <span className="inline-flex items-center gap-2 rounded-full bg-secondary/90 border border-border px-3 py-1 text-xs font-medium shadow-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Actualizando…
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-4 py-10">
                <p className="text-sm text-muted-foreground text-center">
                  No hay archivos de vídeo para previsualizar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

import { memo, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  FolderSearch,
  ExternalLink,
  HardDrive,
  Info,
  Plus,
  X,
  Monitor,
  Cpu,
  Wand2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { CustomSelect } from '../../../components/CustomSelect';
import { CustomSwitch } from '../../../components/CustomSwitch';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { SortableHandle } from '../components/SortableHandle';
import { useSortableList } from '../utils/useSortableList';

interface SystemTabProps {
  settings: any;
  outputDirs: string[];
  onSelectOutputDir: (index: number) => void;
  onOpenOutputDir: (dir: string) => void;
  onAddOutputDir: () => void;
  onRemoveOutputDir: (index: number) => void;
  onReorderOutputDirs?: (from: number, to: number) => void;
  onChange: (key: string, value: any, category?: string) => void;
}

export const SystemTab = memo(function SystemTab({
  settings,
  outputDirs,
  onSelectOutputDir,
  onOpenOutputDir,
  onAddOutputDir,
  onRemoveOutputDir,
  onReorderOutputDirs,
  onChange,
}: SystemTabProps) {
  const { canReorder, listRef, draggingIndex, dropIndex, handlePointerDown, registerRow, getDropLine } =
    useSortableList({
      count: outputDirs.length,
      disabled: !onReorderOutputDirs,
      onReorder: (from, to) => onReorderOutputDirs?.(from, to),
    });

  const getRowKey = useCallback(
    (dir: string, idx: number) => {
      // Solo duplicadas exactas llevan sufijo (carpeta recién elegida).
      const iguales = outputDirs.filter((d) => d === dir).length;
      if (!dir) return `empty-${idx}`;
      return iguales > 1 ? `${dir}__${idx}` : dir;
    },
    [outputDirs],
  );

  const dropLabel =
    draggingIndex !== null && dropIndex !== null && draggingIndex !== dropIndex
      ? `Soltar carpeta ${draggingIndex + 1} en la posición ${dropIndex + 1} de ${outputDirs.length}`
      : null;

  return (
    <>
      <section className="rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/10">
                <Folder className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight">Carpetas de descarga</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hasta 3 carpetas. Las nuevas descargas usan la carpeta que elijas al añadirlas.
                </p>
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-secondary border border-border px-2.5 py-1 text-xs font-mono font-semibold">
              {outputDirs.length}/3
            </span>
          </div>

          <div ref={listRef} role="list" aria-label="Carpetas de descarga" className="space-y-2.5">
            {outputDirs.map((dir: string, idx: number) => {
              const rowKey = getRowKey(dir, idx);
              const isDragging = draggingIndex === idx;
              const line = getDropLine(idx);
              return (
                <div
                  key={rowKey}
                  ref={(el) => registerRow(rowKey, el)}
                  data-row
                  data-dragging={isDragging || undefined}
                  role="listitem"
                  aria-posinset={idx + 1}
                  aria-setsize={outputDirs.length}
                  className={`group relative transition-[background-color,opacity] duration-150 ease-out ${
                    isDragging ? 'opacity-60' : 'opacity-100'
                  }`}
                >
                  {line === 'above' && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 -top-[7px] z-10 h-0.5 rounded-full bg-primary/70"
                    >
                      <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                    </span>
                  )}
                  {line === 'below' && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 -bottom-[7px] z-10 h-0.5 rounded-full bg-primary/70"
                    >
                      <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                    </span>
                  )}
                  <div
                    className={`output-dirs-row group flex flex-col gap-2 transition-[border-color,background-color] sm:flex-row duration-150 ease-out`}
                  >
                    <div
                      className={`flex-1 flex items-center gap-2.5 bg-background border rounded-xl px-2.5 py-2.5 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 ease-out ${
                        line ? 'border-primary/30 bg-primary/[0.04]' : 'border-border/70 group-hover:border-border'
                      }`}
                    >
                      <SortableHandle
                        index={idx}
                        position={idx + 1}
                        name={`Carpeta ${idx + 1}`}
                        canReorder={canReorder}
                        dragging={isDragging}
                        onPointerDown={handlePointerDown}
                      />
                      <div className="p-1.5 rounded-lg bg-secondary border border-border/50 shrink-0">
                        <HardDrive className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate font-medium text-foreground">
                          {dir || <span className="text-muted-foreground italic">Sin definir. Elige una carpeta</span>}
                        </div>
                        {dir && <div className="text-[11px] text-muted-foreground truncate select-text">{dir}</div>}
                      </div>
                      {dir && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full border border-border/50 shrink-0">
                          #{idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <AppTooltip content="Seleccionar carpeta">
                        <button
                          type="button"
                          onClick={() => onSelectOutputDir(idx)}
                          aria-label={`Seleccionar carpeta ${idx + 1}`}
                          className="inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 border border-border px-3.5 py-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <FolderSearch className="w-4 h-4" />
                          <span className="hidden sm:inline">Elegir</span>
                        </button>
                      </AppTooltip>
                      <AppTooltip content="Abrir en explorador">
                        <span className="inline-flex">
                          <button
                            type="button"
                            onClick={() => onOpenOutputDir(dir)}
                            disabled={!dir}
                            aria-label={`Abrir carpeta ${idx + 1}`}
                            className="inline-flex items-center justify-center bg-background hover:bg-secondary border border-border px-3 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </span>
                      </AppTooltip>
                      {outputDirs.length > 1 && (
                        <AppTooltip content="Quitar carpeta">
                          <button
                            type="button"
                            onClick={() => onRemoveOutputDir(idx)}
                            aria-label={`Quitar carpeta ${idx + 1}`}
                            className="inline-flex items-center justify-center bg-background hover:bg-destructive/10 hover:text-destructive-fg hover:border-destructive/20 border border-border px-3 py-2 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </AppTooltip>
                      )}
                      {canReorder && (
                        <span
                          className="inline-flex items-center gap-1"
                          role="group"
                          aria-label={`Reordenar carpeta ${idx + 1}`}
                        >
                          <button
                            type="button"
                            onClick={() => onReorderOutputDirs?.(idx, idx - 1)}
                            disabled={idx === 0}
                            aria-label={`Subir carpeta ${idx + 1}`}
                            className="relative inline-flex items-center justify-center bg-background hover:bg-secondary border border-border px-2 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 after:absolute after:-inset-2 after:content-['']"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onReorderOutputDirs?.(idx, idx + 1)}
                            disabled={idx === outputDirs.length - 1}
                            aria-label={`Bajar carpeta ${idx + 1}`}
                            className="relative inline-flex items-center justify-center bg-background hover:bg-secondary border border-border px-2 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 after:absolute after:-inset-2 after:content-['']"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <span aria-live="polite" className="sr-only">
            {dropLabel ?? ''}
          </span>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Cambiar carpetas no mueve lo que ya está en curso. Las nuevas usan la
              carpeta elegida al añadirlas.
            </p>
            {outputDirs.length < 3 && (
              <button
                type="button"
                onClick={onAddOutputDir}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 hover:bg-primary/15 text-primary border border-primary/15 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Plus className="w-4 h-4" /> Añadir carpeta
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Monitor className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Proveedor y arranque</h3>
        </div>
        <div className="grid grid-cols-1 gap-5">
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              Proveedor por defecto al iniciar
              <span className="text-[11px] font-bold tracking-widest uppercase bg-secondary text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">
                Reinicio
              </span>
            </span>
            <CustomSelect
              value={settings.defaultProvider || 'animeav1'}
              onChange={(v) => onChange('defaultProvider', v)}
              ariaLabel="Proveedor por defecto al iniciar"
              className="w-full"
              options={[
                { value: 'animeav1', label: 'AnimeAV1 — Principal' },
                { value: 'jkanime', label: 'JkAnime — Secundario' },
              ]}
            />
            <div className="rounded-xl bg-secondary/30 border border-border/40 p-3 flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${settings.defaultProvider === 'animeav1' ? 'bg-primary' : 'bg-brand'}`}
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                {settings.defaultProvider === 'animeav1'
                  ? 'AnimeAV1 ofrece mayor catálogo. Se aplicará al reiniciar.'
                  : 'JkAnime como alternativa. Se aplicará al reiniciar.'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Monitor className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Comportamiento y rendimiento</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-background p-4 flex items-start justify-between gap-3">
            <div className="flex gap-3 min-w-0 items-start">
              <div className="w-8 h-8 flex items-center justify-center bg-secondary rounded-lg border border-border/50 shrink-0 self-start">
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">Minimizar a la bandeja al cerrar</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Mantiene la app en segundo plano y conserva las descargas activas.
                </p>
              </div>
            </div>
            <CustomSwitch
              checked={settings.minimizeToTrayOnClose || false}
              onChange={(c) => onChange('minimizeToTrayOnClose', c)}
              ariaLabel="Minimizar a la bandeja al cerrar"
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-4 flex items-start justify-between gap-3">
            <div className="flex gap-3 min-w-0 items-start">
              <div className="w-8 h-8 flex items-center justify-center bg-secondary rounded-lg border border-border/50 shrink-0 self-start">
                <Cpu className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
                  Aceleración por hardware
                  <span className="text-[11px] font-bold tracking-widest uppercase bg-secondary text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">
                    Reinicio
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Usa la GPU para una interfaz más fluida. Requiere reiniciar.
                </p>
              </div>
            </div>
            <CustomSwitch
              checked={settings.hardwareAcceleration !== false}
              ariaLabel="Aceleración por hardware"
              onChange={(checked) => {
                onChange('hardwareAcceleration', checked);
              }}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-background p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3 min-w-0 items-start">
              <div className="w-8 h-8 flex items-center justify-center bg-secondary rounded-lg border border-border/50 shrink-0 self-start">
                <Wand2 className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
                  Renombrado retroactivo
                  <span className="text-[11px] font-bold tracking-widest uppercase bg-secondary text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">
                    Reinicio
                  </span>
                  <AppTooltip content="Se aplica una vez en el próximo inicio y luego se desactiva sola. Ordena los vídeos de tus carpetas según el estilo elegido. Puedes volver a activarla cuando quieras.">
                    <span aria-hidden="true" className="inline-flex text-muted-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </AppTooltip>
                  {settings.autoRenameRetroactive && (
                    <span className="text-[11px] font-bold tracking-widest uppercase bg-warning/10 text-warning border border-warning/20 px-1.5 py-0.5 rounded">
                      Pendiente
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  En el próximo inicio ordena los archivos según el estilo elegido. Se desactiva sola al terminar.
                </p>
              </div>
            </div>
            <CustomSwitch
              checked={settings.autoRenameRetroactive || false}
              onChange={(c) => onChange('autoRenameRetroactive', c)}
              ariaLabel="Renombrado retroactivo"
            />
          </div>
        </div>
      </section>
    </>
  );
});

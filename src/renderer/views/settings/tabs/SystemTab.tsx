import { memo, useState, useCallback, useEffect, useRef } from 'react';
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
  GripVertical,
} from 'lucide-react';
import { CustomSelect } from '../../../components/CustomSelect';
import { CustomSwitch } from '../../../components/CustomSwitch';
import { AppTooltip } from '../../../components/ui/AppTooltip';

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
  const canReorder = outputDirs.length > 1 && !!onReorderOutputDirs;
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const clearDrag = useCallback(() => {
    draggedIndexRef.current = null;
    dragOverIndexRef.current = null;
    pointerIdRef.current = null;
    setDraggedIndex(null);
    setDragOverIndex(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const updateDragOver = useCallback((clientY: number) => {
    const dragIdx = draggedIndexRef.current;
    if (dragIdx === null || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-row]'));
    if (rows.length === 0) return;
    let target: number | null = null;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        target = i;
        break;
      }
      if (i === rows.length - 1) target = i;
    }
    if (target === null) return;
    if (target === dragIdx) {
      dragOverIndexRef.current = null;
      setDragOverIndex(null);
    } else {
      dragOverIndexRef.current = target;
      setDragOverIndex(target);
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, idx: number) => {
      if (!canReorder) return;
      if (e.button !== 0) return;
      e.preventDefault();
      draggedIndexRef.current = idx;
      dragOverIndexRef.current = null;
      pointerIdRef.current = e.pointerId;
      setDraggedIndex(idx);
      setDragOverIndex(null);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    },
    [canReorder],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (draggedIndexRef.current === null) return;
      updateDragOver(e.clientY);
    },
    [updateDragOver],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const from = draggedIndexRef.current;
      const to = dragOverIndexRef.current;
      if (pointerIdRef.current !== null && e.pointerId !== undefined && e.pointerId !== pointerIdRef.current) {
        if (e.type === 'pointerup') return;
      }
      if (from !== null && to !== null && from !== to && from >= 0 && to >= 0) {
        onReorderOutputDirs?.(from, to);
      }
      try {
        if (pointerIdRef.current !== null) {
          const el = document.querySelector('[data-drag-handle][data-dragging="true"]') as HTMLElement | null;
          el?.releasePointerCapture?.(pointerIdRef.current);
        }
      } catch {}
      clearDrag();
    },
    [clearDrag, onReorderOutputDirs],
  );

  useEffect(() => {
    if (draggedIndex === null) return;
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') clearDrag();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      document.removeEventListener('keydown', onKey);
    };
  }, [draggedIndex, handlePointerMove, handlePointerUp, clearDrag]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const seenForKey = new Map<string, number>();
  const getRowKey = (dir: string, idx: number) => {
    if (!dir) return `empty-${idx}`;
    const count = (seenForKey.get(dir) ?? 0) + 1;
    seenForKey.set(dir, count);
    return count === 1 ? dir : `${dir}__${count}`;
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/90 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/10">
                <Folder className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight">Carpetas de Descarga</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hasta 3 destinos. El escáner trabaja en paralelo y la cola respeta la carpeta al encolar.
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
              const isDragging = draggedIndex === idx;
              const isDragOver = dragOverIndex === idx && draggedIndex !== null && draggedIndex !== idx;
              return (
                <div key={rowKey} className="space-y-1">
                  {isDragOver && draggedIndex !== null && draggedIndex > idx && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none h-0.5 mx-2 rounded-full bg-primary/70 shadow-[0_0_8px_var(--color-primary)] animate-in fade-in duration-150"
                    />
                  )}
                  <div
                    data-row
                    role="listitem"
                    className={`output-dirs-row group flex flex-col gap-2 sm:flex-row ${isDragging ? 'opacity-60' : 'opacity-100'} ${isDragOver ? 'scale-[1.01]' : 'scale-100'}`}
                  >
                    <div
                      className={`flex-1 flex items-center gap-2.5 bg-background border rounded-xl px-2.5 py-2.5 shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-160 ease-out ${
                        isDragging
                          ? 'border-primary/30 ring-1 ring-primary/20 shadow-md scale-[1.01]'
                          : isDragOver
                            ? 'border-primary/30 bg-primary/[0.04] ring-1 ring-primary/15'
                            : 'border-border/70 group-hover:border-border'
                      }`}
                    >
                      <AppTooltip content={canReorder ? 'Arrastra para reordenar' : ''}>
                        <button
                          type="button"
                          data-drag-handle
                          data-dragging={isDragging ? 'true' : 'false'}
                          tabIndex={-1}
                          onPointerDown={(e) => handlePointerDown(e, idx)}
                          disabled={!canReorder}
                          aria-label={`Carpeta ${idx + 1}`}
                          style={{ touchAction: 'none' }}
                          className={`app-region-no-drag shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-[background-color,border-color,color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 select-none touch-none ${
                            canReorder
                              ? 'bg-secondary/60 border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-border cursor-grab active:cursor-grabbing active:scale-95'
                              : 'bg-secondary/30 border-transparent text-muted-foreground/40 cursor-not-allowed'
                          } ${isDragging ? 'cursor-grabbing bg-secondary border-border' : ''}`}
                        >
                          <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                        </button>
                      </AppTooltip>
                      <div className="p-1.5 rounded-lg bg-secondary border border-border/50 shrink-0">
                        <HardDrive className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate font-medium text-foreground">
                          {dir || (
                            <span className="text-muted-foreground italic">Sin definir — selecciona una carpeta</span>
                          )}
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
                            aria-label={`Eliminar carpeta ${idx + 1}`}
                            className="inline-flex items-center justify-center bg-background hover:bg-destructive/10 hover:text-destructive-fg hover:border-destructive/20 border border-border px-3 py-2 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </AppTooltip>
                      )}
                    </div>
                  </div>
                  {isDragOver && draggedIndex !== null && draggedIndex < idx && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none h-0.5 mx-2 rounded-full bg-primary/70 shadow-[0_0_8px_var(--color-primary)] animate-in fade-in duration-150"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> Cambiar carpetas no mueve descargas en curso. Las nuevas usan la carpeta
              elegida al encolar.
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
              Proveedor por Defecto al Iniciar
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
                className={`w-2 h-2 rounded-full shrink-0 ${settings.defaultProvider === 'animeav1' ? 'bg-emerald-500' : 'bg-violet-500'}`}
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                {settings.defaultProvider === 'animeav1'
                  ? 'AnimeAV1 ofrece mayor catálogo y servidores HLS estables. Inicio, filtros y catálogo se precargan antes del primer render. Se aplicará al reiniciar.'
                  : 'JkAnime como respaldo. Inicio, filtros y catálogo se precargan antes del primer render. Se aplicará al reiniciar.'}
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
          <h3 className="text-sm font-bold tracking-tight">Comportamiento y Rendimiento</h3>
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
                  Mantiene la app en segundo plano y conserva descargas activas.
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
                  Aceleración por Hardware
                  <span className="text-[11px] font-bold tracking-widest uppercase bg-secondary text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">
                    Reinicio
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Usa la GPU para animaciones y scroll más fluido. Requiere reiniciar.
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
                  <AppTooltip content="Se aplica una sola vez en el próximo inicio y luego se apaga solo. Ordena los videos de tus carpetas al estilo elegido, también los no vinculados. Si lo necesitas de nuevo, vuelve a encenderlo.">
                    <span aria-hidden="true" className="inline-flex text-muted-foreground">
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </AppTooltip>
                  {settings.autoRenameRetroactive && (
                    <span className="text-[11px] font-bold tracking-widest uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      Masiva
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  En el próximo inicio ordena los archivos al estilo elegido. Se desactiva solo al terminar.
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

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Info, RotateCcw } from 'lucide-react';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { CustomSwitch } from '../../../components/CustomSwitch';
import { SortableHandle } from './SortableHandle';
import { useSortableList } from '../utils/useSortableList';

interface ServerOrderCardProps {
  providerLabel: string;
  hint: string;
  iconSrc: string;
  candidates: readonly string[];
  active: readonly string[];
  onReorder: (from: number, to: number) => void;
  onToggle: (name: string) => void;
  onReset: () => void;
}

export const ServerOrderCard = memo(function ServerOrderCard({
  providerLabel,
  hint,
  iconSrc,
  candidates,
  active,
  onReorder,
  onToggle,
  onReset,
}: ServerOrderCardProps) {
  const inactive = candidates.filter((name) => !active.includes(name));

  const { canReorder, listRef, draggingIndex, dropIndex, handlePointerDown, registerRow, getDropLine, prepareFlip } =
    useSortableList({ count: active.length, disabled: active.length < 2, onReorder });

  const handleStep = useCallback(
    (from: number, to: number) => {
      prepareFlip();
      onReorder(from, to);
    },
    [prepareFlip, onReorder],
  );

  const handleResetClick = useCallback(() => {
    prepareFlip();
    onReset();
  }, [prepareFlip, onReset]);

  const [flashName, setFlashName] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const handleToggle = useCallback(
    (name: string) => {
      onToggle(name);
      setFlashName(name);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashName(null), 800);
    },
    [onToggle],
  );

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const draggingName = draggingIndex !== null ? active[draggingIndex] : null;
  const dropLabel =
    draggingName && dropIndex !== null && dropIndex !== draggingIndex
      ? `Soltar ${draggingName} en la posición ${dropIndex + 1} de ${active.length}`
      : null;

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <img src={iconSrc} alt="" aria-hidden="true" className="h-[18px] w-[18px] shrink-0 rounded" draggable={false} />
        <span className="text-sm font-semibold">{providerLabel}</span>
        <span className="select-none text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary">
          {hint}
        </span>
        <span className="ml-auto shrink-0 select-none text-[13px] font-medium tabular-nums text-text-tertiary">
          {active.length} de {candidates.length} activos
        </span>
        <AppTooltip content="Apagado se salta y no se intenta. Si lo vuelves a activar, se añade al final.">
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground"
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </AppTooltip>
      </div>

      <div ref={listRef} role="list" aria-label={`Servidores de ${providerLabel}`}>
        {active.map((name, idx) => {
          const isDragging = draggingIndex === idx;
          const line = getDropLine(idx);
          return (
            <div
              key={name}
              ref={(el) => registerRow(name, el)}
              data-row
              data-dragging={isDragging || undefined}
              role="listitem"
              aria-posinset={idx + 1}
              aria-setsize={active.length}
              className={`group/server-row relative border-b border-border/40 transition-[background-color,opacity] last:border-b-0 duration-150 ease-out ${
                isDragging ? 'opacity-60' : 'opacity-100'
              } ${line ? 'bg-primary/[0.04]' : 'hover:bg-secondary/40'}`}
            >
              {line === 'above' && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-2 top-0 z-10 h-0.5 rounded-full bg-primary/70"
                >
                  <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
              {line === 'below' && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-2 bottom-0 z-10 h-0.5 rounded-full bg-primary/70"
                >
                  <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                </span>
              )}

              <div className="flex items-center gap-2.5 px-2 py-3">
                <SortableHandle
                  index={idx}
                  position={idx + 1}
                  name={`${name} en ${providerLabel}`}
                  canReorder={canReorder}
                  dragging={isDragging}
                  onPointerDown={handlePointerDown}
                />
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                    idx === 0
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-background text-text-tertiary'
                  }`}
                >
                  {idx + 1}
                </span>

                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
                <span
                  role="group"
                  aria-label={`Ordenar ${name} en ${providerLabel}`}
                  className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/server-row:opacity-100 group-hover/server-row:opacity-100"
                >
                  <button
                    type="button"
                    onClick={() => handleStep(idx, idx - 1)}
                    disabled={idx === 0}
                    aria-label={`Subir ${name} en ${providerLabel}`}
                    className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(idx, idx + 1)}
                    disabled={idx === active.length - 1}
                    aria-label={`Bajar ${name} en ${providerLabel}`}
                    className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </span>
                <CustomSwitch
                  checked
                  onChange={() => handleToggle(name)}
                  ariaLabel={`Desactivar ${name} en ${providerLabel}`}
                />
              </div>

              {flashName === name && (
                <span
                  aria-hidden="true"
                  className="settings-row-flash pointer-events-none absolute inset-0 bg-primary/10"
                />
              )}
            </div>
          );
        })}
      </div>

      {active.length === 0 && (
        <div
          role="note"
          className="mt-2 flex gap-1.5 rounded-lg border border-warning/10 bg-warning/5 px-3 py-2 text-xs text-warning"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Sin servidores activos, {providerLabel} no descargará nada.</span>
        </div>
      )}

      {inactive.length > 0 && (
        <>
          <div className="mt-3 border-t border-border/40 pt-3">
            <span className="select-none text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary">
              Se saltan
            </span>
          </div>
          <div role="list" aria-label={`Servidores desactivados de ${providerLabel}`}>
            {inactive.map((name) => (
              <div
                key={name}
                role="listitem"
                className="group/server-row flex items-center gap-2.5 border-b border-border/40 px-2 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 select-none items-center justify-center text-xs tabular-nums text-text-tertiary"
                >
                  –
                </span>
                <span className="min-w-0 flex-1 truncate py-3 text-sm font-medium text-muted-foreground">{name}</span>
                <CustomSwitch
                  checked={false}
                  onChange={() => handleToggle(name)}
                  ariaLabel={`Activar ${name} en ${providerLabel}`}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-end">
        <AppTooltip content="Vuelve al orden por defecto.">
          <button
            type="button"
            onClick={handleResetClick}
            aria-label={`Restablecer servidores de ${providerLabel}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restablecer
          </button>
        </AppTooltip>
      </div>

      <span aria-live="polite" className="sr-only">
        {dropLabel ?? ''}
      </span>
    </div>
  );
});

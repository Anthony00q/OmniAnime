import React, { useLayoutEffect, useRef, useState } from 'react';
import { AppTooltip } from './ui/AppTooltip';

type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

interface ToastPositionSelectorProps {
  value: ToastPosition;
  onChange: (value: ToastPosition) => void;
}

export function ToastPositionSelector({ value, onChange }: ToastPositionSelectorProps) {
  const positions: { id: ToastPosition; label: string; gridArea: string }[] = [
    { id: 'top-left', label: 'Arriba Izquierda', gridArea: 'col-start-1 row-start-1' },
    { id: 'top-center', label: 'Arriba Centro', gridArea: 'col-start-2 row-start-1' },
    { id: 'top-right', label: 'Arriba Derecha', gridArea: 'col-start-3 row-start-1' },
    { id: 'bottom-left', label: 'Abajo Izquierda', gridArea: 'col-start-1 row-start-3' },
    { id: 'bottom-center', label: 'Abajo Centro', gridArea: 'col-start-2 row-start-3' },
    { id: 'bottom-right', label: 'Abajo Derecha', gridArea: 'col-start-3 row-start-3' },
  ];

  // transform-only avoids left/center bounce
  const previewRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 200 });
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    // sync measure before first paint
    const w0 = el.getBoundingClientRect().width;
    if (w0 > 0) setSize({ w: w0, h: w0 * 0.625 });
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setSize({ w, h: w * 0.625 });
    });
    ro.observe(el);
    // enable transition after first frame
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setIsReady(true));
    });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const getToastTransform = (pos: ToastPosition) => {
    const pillW = 80;
    const pillH = 29.6;
    const m = 12;
    const topY = 32; // deja 8px bajo header h-6
    const bottomY = size.h - pillH - 12;
    const centerX = (size.w - pillW) / 2;
    const rightX = size.w - pillW - m;
    let x = m;
    let y = topY;
    if (pos.includes('center')) x = centerX;
    if (pos.includes('right')) x = rightX;
    if (pos.includes('bottom')) y = bottomY;
    x = Math.max(m, Math.min(x, size.w - pillW - m));
    y = Math.max(topY, Math.min(y, size.h - pillH - 4));
    return `translate3d(${x}px, ${y}px, 0)`;
  };

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div
        ref={previewRef}
        className="relative w-full aspect-[16/10] max-w-[320px] mx-auto bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden select-none"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-secondary/20 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-6 bg-secondary/40 backdrop-blur-sm border-b border-border/40 flex items-center px-3 gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70 shadow-sm border border-red-600/20" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70 shadow-sm border border-yellow-600/20" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70 shadow-sm border border-green-600/20" />
          <span className="ml-2 text-[11px] font-bold tracking-widest uppercase text-muted-foreground/70">
            OmniAnime — Preview
          </span>
          <div className="ml-auto w-8 h-1 rounded-full bg-foreground/5" />
        </div>

        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 mt-6 p-1.5 gap-1">
          {positions.map((pos) => (
            <AppTooltip key={pos.id} content={pos.label}>
              <button
                type="button"
                onClick={() => onChange(pos.id)}
                className={`relative w-full h-full cursor-pointer rounded-xl transition-colors duration-150 motion-reduce:transition-none ${pos.gridArea} ${
                  value === pos.id ? 'bg-primary/[0.07]' : 'hover:bg-secondary/50'
                }`}
                aria-label={`Seleccionar posición ${pos.label}`}
              >
                <div
                  className={`absolute inset-0 rounded-xl border-[1.5px] border-dashed transition-colors duration-150 motion-reduce:transition-none ${
                    value === pos.id
                      ? 'border-primary/35 bg-primary/[0.06] shadow-sm shadow-primary/5'
                      : 'border-border/30 group-hover:border-border/50'
                  }`}
                />
                {value === pos.id && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
                  </span>
                )}
              </button>
            </AppTooltip>
          ))}
        </div>

        <div
          style={{ transform: getToastTransform(value) }}
          className={`absolute left-0 top-0 w-[5rem] h-[1.85rem] bg-popover border border-primary/25 rounded-full shadow-xl shadow-primary/15 backdrop-blur-sm flex items-center px-2 gap-1.5 will-change-transform pointer-events-none z-10 ${isReady ? 'transition-[transform] duration-[220ms] motion-reduce:transition-none [transition-timing-function:var(--ease-out)]' : 'transition-none motion-reduce:transition-none'}`}
        >
          <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="w-full h-1 bg-foreground/15 rounded-full" />
            <div className="w-[68%] h-1 bg-foreground/7 rounded-full" />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        Toca una zona para mover la alerta. Se guarda al pulsar “Guardar cambios”.
      </p>
    </div>
  );
}

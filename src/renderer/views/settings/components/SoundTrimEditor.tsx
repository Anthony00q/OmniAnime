import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Play, Square } from 'lucide-react';
import { MAX_TRIM_SEC, MIN_TRIM_SEC, clampPlayhead, peaksFromSamples } from '../../../../utils/soundTrim';
import { previewSoundSlice, stopPreviewSound } from '../../../utils/sound';

interface SoundTrimEditorProps {
  buffer: AudioBuffer;
  initialStartSec: number;
  initialTrimSec: number;
  volume: number;
  onConfirm: (trimStartSec: number, trimSec: number) => void;
  onBack: () => void;
}

type DragMode = 'start' | 'end' | 'move' | 'playhead';

const BUCKETS = 160;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

export function SoundTrimEditor({
  buffer,
  initialStartSec,
  initialTrimSec,
  volume,
  onConfirm,
  onBack,
}: SoundTrimEditorProps) {
  const duration = Number.isFinite(buffer.duration) && buffer.duration > 0 ? buffer.duration : 0;
  const [startSec, setStartSec] = useState(() =>
    round3(Math.min(Math.max(0, initialStartSec), Math.max(0, duration - MIN_TRIM_SEC))),
  );
  const [trimSec, setTrimSec] = useState(() =>
    round3(Math.min(Math.max(MIN_TRIM_SEC, initialTrimSec), Math.min(MAX_TRIM_SEC, duration || MAX_TRIM_SEC))),
  );
  const [playheadSec, setPlayheadSec] = useState(() => startSec);
  const [playing, setPlaying] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLButtonElement>(null);
  const playheadLabelRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef<HTMLDivElement>(null);
  const windowBoundsRef = useRef({ start: 0, trim: 0 });
  const dragRef = useRef<{ mode: DragMode; startX: number; startSec: number; trimSec: number } | null>(null);
  const scrubSecRef = useRef(0);
  const trackWidthRef = useRef(0);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const playbackRef = useRef<(fromSec: number) => void>(() => {});
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const peaks = useMemo(() => {
    try {
      return peaksFromSamples(buffer.getChannelData(0), BUCKETS);
    } catch {
      return new Array<number>(BUCKETS).fill(0);
    }
  }, [buffer]);

  const endSec = startSec + trimSec;
  const pct = (sec: number) => (duration > 0 ? Math.min(100, Math.max(0, (sec / duration) * 100)) : 0);
  windowBoundsRef.current = { start: startSec, trim: trimSec };

  const movePlayhead = useCallback(
    (sec: number) => {
      const el = playheadRef.current;
      const track = trackRef.current;
      if (!el || !track || duration <= 0) return;
      const width = trackWidthRef.current || track.clientWidth;
      const x = (Math.min(Math.max(0, sec), duration) / duration) * width;
      el.style.transform = `translate3d(${x}px, 0, 0) translateX(-50%)`;
      if (playheadLabelRef.current) playheadLabelRef.current.textContent = formatTime(sec);
      const bounds = windowBoundsRef.current;
      const progress = bounds.trim > 0 ? Math.min(1, Math.max(0, (sec - bounds.start) / bounds.trim)) : 0;
      if (elapsedRef.current) elapsedRef.current.style.transform = `scaleX(${progress})`;
    },
    [duration],
  );

  const applyWindow = useCallback(
    (nextStart: number, nextTrim: number) => {
      const maxWindow = Math.min(MAX_TRIM_SEC, duration || MAX_TRIM_SEC);
      const minWindow = Math.min(MIN_TRIM_SEC, duration || MIN_TRIM_SEC);
      let s = Number.isFinite(nextStart) ? nextStart : 0;
      let t = Number.isFinite(nextTrim) ? nextTrim : maxWindow;
      t = Math.min(maxWindow, Math.max(minWindow, t));
      s = Math.min(Math.max(0, s), Math.max(0, duration - t));
      s = round3(s);
      t = round3(t);
      setStartSec(s);
      setTrimSec(t);
      setPlayheadSec((prev) => clampPlayhead(prev, s, s + t));
    },
    [duration],
  );

  const stopPreviewCore = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    stopPreviewSound();
  }, []);

  const stopPreview = useCallback(() => {
    stopPreviewCore();
    setPlaying(false);
  }, [stopPreviewCore]);

  useEffect(() => () => stopPreviewCore(), [stopPreviewCore]);

  const startPlayback = useCallback(
    (fromSec: number) => {
      if (duration <= 0) return;
      stopPreviewCore();
      const from = round3(clampPlayhead(fromSec, startSec, endSec));
      const length = Math.max(0, endSec - from);
      if (length <= 0) return;
      trackWidthRef.current = trackRef.current?.clientWidth ?? 0;
      previewSoundSlice(buffer, from, length, volume);
      setPlaying(true);
      setPlayheadSec(from);
      movePlayhead(from);
      if (reduceMotion) {
        timerRef.current = window.setTimeout(() => {
          stopPreviewCore();
          setPlaying(false);
          setPlayheadSec(endSec);
          movePlayhead(endSec);
        }, length * 1000);
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const elapsed = (now - t0) / 1000;
        if (elapsed >= length) {
          stopPreviewCore();
          setPlaying(false);
          setPlayheadSec(endSec);
          movePlayhead(endSec);
          return;
        }
        movePlayhead(from + elapsed);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [buffer, duration, endSec, movePlayhead, reduceMotion, startSec, stopPreviewCore, volume],
  );
  playbackRef.current = startPlayback;

  useEffect(() => {
    if (playing) stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSec, trimSec]);

  useEffect(() => {
    movePlayhead(playheadSec);
  }, [movePlayhead, playheadSec, startSec, trimSec]);

  const secFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      return Math.min(Math.max(0, ratio), 1) * duration;
    },
    [duration],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    const onBlur = () => endDrag();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [endDrag]);

  const handleDragStart = useCallback(
    (mode: DragMode) => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (mode === 'playhead') {
        stopPreview();
        scrubSecRef.current = clampPlayhead(secFromClientX(e.clientX), startSec, endSec);
        trackWidthRef.current = trackRef.current?.clientWidth ?? 0;
        movePlayhead(scrubSecRef.current);
      }
      dragRef.current = { mode, startX: e.clientX, startSec, trimSec };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      document.body.style.userSelect = 'none';
    },
    [endSec, movePlayhead, secFromClientX, startSec, stopPreview, trimSec],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const el = trackRef.current;
      if (!el || duration <= 0) return;
      if (drag.mode === 'playhead') {
        scrubSecRef.current = clampPlayhead(secFromClientX(e.clientX), startSec, endSec);
        movePlayhead(scrubSecRef.current);
        return;
      }
      const rect = el.getBoundingClientRect();
      const deltaSec = rect.width > 0 ? ((e.clientX - drag.startX) / rect.width) * duration : 0;
      const minWindow = Math.min(MIN_TRIM_SEC, duration);
      const maxWindow = Math.min(MAX_TRIM_SEC, duration);
      if (drag.mode === 'move') {
        applyWindow(drag.startSec + deltaSec, drag.trimSec);
      } else if (drag.mode === 'start') {
        const fixedEnd = drag.startSec + drag.trimSec;
        const nextStart = Math.min(Math.max(0, drag.startSec + deltaSec), fixedEnd - minWindow);
        const nextTrim = Math.min(maxWindow, fixedEnd - nextStart);
        applyWindow(nextStart, nextTrim);
      } else {
        const nextEnd = Math.min(
          duration,
          Math.max(drag.startSec + minWindow, drag.startSec + drag.trimSec + deltaSec),
        );
        applyWindow(drag.startSec, Math.min(maxWindow, nextEnd - drag.startSec));
      }
    },
    [applyWindow, duration, endSec, movePlayhead, secFromClientX, startSec],
  );

  const handleDragEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      endDrag();
      if (drag.mode === 'playhead') playbackRef.current(scrubSecRef.current);
    },
    [endDrag],
  );

  const handleKey = useCallback(
    (mode: DragMode) => (e: React.KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 1 : 0.1;
      const minWindow = Math.min(MIN_TRIM_SEC, duration);
      const maxWindow = Math.min(MAX_TRIM_SEC, duration);
      if (mode === 'playhead') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          playbackRef.current(playheadSec);
          return;
        }
        let target = playheadSec;
        if (e.key === 'ArrowLeft') target -= step;
        else if (e.key === 'ArrowRight') target += step;
        else if (e.key === 'Home') target = startSec;
        else if (e.key === 'End') target = endSec;
        else return;
        e.preventDefault();
        setPlayheadSec(round3(clampPlayhead(target, startSec, endSec)));
        return;
      }
      let delta = 0;
      if (e.key === 'ArrowLeft') delta = -step;
      else if (e.key === 'ArrowRight') delta = step;
      else if (e.key === 'Home') delta = -duration;
      else if (e.key === 'End') delta = duration;
      else return;
      e.preventDefault();
      if (mode === 'move') applyWindow(startSec + delta, trimSec);
      else if (mode === 'start') {
        const fixedEnd = startSec + trimSec;
        const nextStart = Math.min(Math.max(0, startSec + delta), fixedEnd - minWindow);
        applyWindow(nextStart, Math.min(maxWindow, fixedEnd - nextStart));
      } else {
        const nextEnd = Math.min(duration, Math.max(startSec + minWindow, startSec + trimSec + delta));
        applyWindow(startSec, Math.min(maxWindow, nextEnd - startSec));
      }
    },
    [applyWindow, duration, endSec, playheadSec, startSec, trimSec],
  );

  const handleClass =
    'group absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 after:absolute after:-inset-2 after:content-[""]';
  const handleBarClass =
    'pointer-events-none absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-primary transition-[filter] duration-150 ease-out group-hover:brightness-110 group-active:brightness-125';
  const handleThumbClass =
    'pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background/70 transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-125';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            stopPreview();
            onBack();
          }}
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Volver"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h4 className="text-sm font-bold leading-tight">Recortar sonido</h4>
          <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
            Arrastra la ventana para elegir qué parte usar. Arrastra el cursor para escuchar desde un punto exacto.
          </p>
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-20 w-full rounded-xl border border-border/60 bg-background select-none touch-none"
      >
        <div className="absolute inset-0 overflow-hidden rounded-[11px]">
          <div className="absolute inset-0 flex items-center gap-px px-1">
            {peaks.map((p, i) => (
              <span
                key={i}
                className="flex-1 rounded-[1px] bg-text-tertiary/70"
                style={{ height: `${Math.max(4, p * 100)}%` }}
              />
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-background/70"
            style={{ width: `${pct(startSec)}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-background/70"
            style={{ width: `${100 - pct(endSec)}%` }}
          />
          <div
            className="absolute inset-y-0 border-x-2 border-primary/60 bg-primary/15 cursor-grab active:cursor-grabbing touch-none"
            style={{ left: `${pct(startSec)}%`, width: `${pct(endSec) - pct(startSec)}%` }}
            onPointerDown={handleDragStart('move')}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <div
              ref={elapsedRef}
              className="pointer-events-none absolute inset-y-0 left-[2px] right-[2px] origin-left bg-primary/25"
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
        </div>

        <button
          ref={playheadRef}
          type="button"
          role="slider"
          aria-label="Posición de escucha"
          aria-valuemin={startSec}
          aria-valuemax={endSec}
          aria-valuenow={playheadSec}
          aria-valuetext={`${formatTime(playheadSec)} s`}
          className="absolute top-0 bottom-0 flex w-3 cursor-grab touch-none items-center justify-center active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 after:absolute after:-inset-2 after:content-['']"
          style={{ transform: 'translate3d(0, 0, 0) translateX(-50%)' }}
          onPointerDown={handleDragStart('playhead')}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onKeyDown={handleKey('playhead')}
        >
          <span
            className={`pointer-events-none h-full w-0.5 rounded-full ${playing ? 'bg-primary' : 'bg-primary/80'}`}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-1/2 top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary ring-2 ring-background/60 ${playing ? 'brightness-125' : ''}`}
          />
        </button>

        <button
          type="button"
          role="slider"
          aria-label="Inicio del recorte"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration - MIN_TRIM_SEC)}
          aria-valuenow={startSec}
          aria-valuetext={`${formatTime(startSec)} s`}
          className={handleClass}
          style={{ left: `${pct(startSec)}%` }}
          onPointerDown={handleDragStart('start')}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onKeyDown={handleKey('start')}
        >
          <span className={handleBarClass} />
          <span className={handleThumbClass} />
        </button>
        <button
          type="button"
          role="slider"
          aria-label="Duración del recorte"
          aria-valuemin={Math.min(MIN_TRIM_SEC, duration)}
          aria-valuemax={Math.min(MAX_TRIM_SEC, duration)}
          aria-valuenow={trimSec}
          aria-valuetext={`${trimSec.toFixed(1)} s`}
          className={handleClass}
          style={{ left: `${pct(endSec)}%` }}
          onPointerDown={handleDragStart('end')}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onKeyDown={handleKey('end')}
        >
          <span className={handleBarClass} />
          <span className={handleThumbClass} />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground tabular-nums">
          <span aria-live="polite">
            {formatTime(startSec)} – {formatTime(endSec)} ·{' '}
            <span className="text-foreground font-semibold">{trimSec.toFixed(1)} s</span>
          </span>
          <span className="ml-2 text-foreground/80">
            en <span ref={playheadLabelRef}>{formatTime(playheadSec)}</span>
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (playing ? stopPreview() : startPlayback(startSec))}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {playing ? (
              <Square className="w-3.5 h-3.5 text-primary" />
            ) : (
              <Play className="w-3.5 h-3.5 text-primary" fill="currentColor" />
            )}
            {playing ? 'Detener' : 'Probar selección'}
          </button>
          <button
            type="button"
            onClick={() => {
              stopPreview();
              onConfirm(startSec, trimSec);
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Usar recorte
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';

// Fade del título solo si no cabe (mide overflow real).
export function useIsTitleTruncated(text: string) {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    let raf = 0;
    let disposed = false;
    const check = () => {
      if (disposed) return;
      // Vista keep-alive oculta: clientWidth 0, conserva el valor previo.
      if (el.clientWidth === 0) return;
      const next = el.scrollWidth > el.clientWidth + 1;
      setIsTruncated((prev) => (prev === next ? prev : next));
    };
    const scheduleCheck = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('resize', scheduleCheck);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleCheck);
      ro.observe(el);
    }
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(check).catch(() => {});
    }
    return () => {
      disposed = true;
      window.removeEventListener('resize', scheduleCheck);
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [text]);

  return { titleRef, isTruncated };
}

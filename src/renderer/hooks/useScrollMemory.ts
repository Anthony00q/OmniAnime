import { useEffect, type RefObject } from 'react';

// El scroll de las vistas vive en su scroller interno (no en window), así que se
// guarda al salir y se recupera al volver, aunque el contenido lazy pinte tarde.
const SCROLLER_SELECTOR = '.overflow-y-auto, .details-scroll, .library-scroll';
const RETRY_MS = 50;
const MAX_RETRIES = 40;

const positions = new Map<string, number>();

export function useScrollMemory(containerRef: RefObject<HTMLElement | null>, key: string): void {
  useEffect(() => {
    const container = containerRef.current;
    const findScroller = (): Element | null => container?.querySelector(SCROLLER_SELECTOR) ?? null;
    let retries = MAX_RETRIES;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const restore = () => {
      const scroller = findScroller();
      if (scroller) {
        scroller.scrollTop = positions.get(key) ?? 0;
        return;
      }
      if (retries-- > 0) timer = setTimeout(restore, RETRY_MS);
    };
    restore();

    return () => {
      if (timer) clearTimeout(timer);
      const scroller = findScroller();
      if (scroller) positions.set(key, scroller.scrollTop);
    };
  }, [containerRef, key]);
}

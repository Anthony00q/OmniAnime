import { useEffect, type RefObject } from 'react';

const SCROLLER_SELECTOR = '.overflow-y-auto, .details-scroll, .library-scroll';
const RETRY_MS = 100;
const MAX_RETRIES = 100;

const positions = new Map<string, number>();

export function useScrollMemory(containerRef: RefObject<HTMLElement | null>, key: string): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const findScroller = (): Element | null =>
      container.querySelector('[data-view-scroller]') ?? container.querySelector(SCROLLER_SELECTOR);
    const target = positions.get(key) ?? 0;
    let scroller: Element | null = null;
    let lastPosition = target;
    let restoring = true;
    let retries = MAX_RETRIES;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const remember = () => {
      if (!restoring && scroller) lastPosition = scroller.scrollTop;
    };
    const stopRestoring = () => {
      restoring = false;
      clearTimeout(timer);
      remember();
    };
    const restore = () => {
      const next = findScroller();
      if (next !== scroller) {
        scroller?.removeEventListener('scroll', remember);
        scroller = next;
        scroller?.addEventListener('scroll', remember, { passive: true });
      }
      if (scroller) {
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (maxScroll >= target || retries === 0) {
          scroller.scrollTop = Math.min(target, maxScroll);
          stopRestoring();
          return;
        }
      }
      if (retries-- > 0) timer = setTimeout(restore, RETRY_MS);
    };
    const cancelOnKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopRestoring();
    };
    container.addEventListener('wheel', stopRestoring, { passive: true });
    container.addEventListener('touchstart', stopRestoring, { passive: true });
    container.addEventListener('pointerdown', stopRestoring);
    container.addEventListener('keydown', cancelOnKey);
    restore();

    return () => {
      clearTimeout(timer);
      scroller?.removeEventListener('scroll', remember);
      container.removeEventListener('wheel', stopRestoring);
      container.removeEventListener('touchstart', stopRestoring);
      container.removeEventListener('pointerdown', stopRestoring);
      container.removeEventListener('keydown', cancelOnKey);
      if (!restoring) {
        const current = findScroller();
        if (current && current !== scroller) lastPosition = current.scrollTop;
        if (scroller || current) positions.set(key, lastPosition);
      }
    };
  }, [containerRef, key]);
}

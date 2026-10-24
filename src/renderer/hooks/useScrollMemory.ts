import { useLayoutEffect, type RefObject } from 'react';

const SCROLLER_SELECTOR = '.overflow-y-auto, .details-scroll, .library-scroll';
const RETRY_MS = 100;
const RESTORE_TIMEOUT_MS = 10_000;

const positions = new Map<string, number>();

export function useScrollMemory(
  containerRef: RefObject<HTMLElement | null>,
  key: string,
  { rememberPosition = true }: { rememberPosition?: boolean } = {},
): void {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const findScroller = (): Element | null =>
      container.querySelector('[data-view-scroller]') ?? container.querySelector(SCROLLER_SELECTOR);
    if (!rememberPosition) {
      positions.delete(key);
      const scroller = findScroller();
      if (scroller) scroller.scrollTop = 0;
      return;
    }
    const target = positions.get(key) ?? 0;
    let scroller: Element | null = null;
    let lastPosition = target;
    let restoring = true;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const remember = () => {
      if (!restoring && scroller) lastPosition = scroller.scrollTop;
    };
    const stopRestoring = () => {
      restoring = false;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      remember();
    };
    const restore = () => {
      if (!restoring) return;
      clearTimeout(timer);
      const next = findScroller();
      if (next !== scroller) {
        scroller?.removeEventListener('scroll', remember);
        scroller = next;
        scroller?.addEventListener('scroll', remember, { passive: true });
        if (scroller) resizeObserver?.observe(scroller);
        if (scroller?.firstElementChild) resizeObserver?.observe(scroller.firstElementChild);
      }
      if (scroller) {
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (maxScroll >= target || timedOut) {
          scroller.scrollTop = Math.min(target, maxScroll);
          stopRestoring();
          return;
        }
      }
      if (timedOut) stopRestoring();
      else timer = setTimeout(restore, RETRY_MS);
    };
    const cancelOnKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopRestoring();
    };
    container.addEventListener('wheel', stopRestoring, { passive: true });
    container.addEventListener('touchstart', stopRestoring, { passive: true });
    container.addEventListener('pointerdown', stopRestoring);
    container.addEventListener('keydown', cancelOnKey);
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(restore);
      observer.observe(container, {
        childList: true,
        subtree: true,
      });
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(restore);
      resizeObserver.observe(container);
    }
    const deadlineTimer = setTimeout(() => {
      timedOut = true;
      restore();
    }, RESTORE_TIMEOUT_MS);
    restore();

    return () => {
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      observer?.disconnect();
      resizeObserver?.disconnect();
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
      restoring = false;
    };
  }, [containerRef, key, rememberPosition]);
}

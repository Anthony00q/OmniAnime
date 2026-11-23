import { useLayoutEffect, useRef, useState } from 'react';

export function useShouldVirtualize(
  ready: boolean,
  rowCount: number,
  cols: number,
  withThumbs: boolean,
  hasTitles: boolean,
) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [geometry, setGeometry] = useState<{ width: number; maxHeight: number; wide: boolean } | null>(null);
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!ready || !node) {
      setGeometry(null);
      return;
    }
    const measure = () => {
      const next = { width: node.clientWidth, maxHeight: window.innerHeight * 0.55, wide: window.innerWidth >= 640 };
      setGeometry((prev) =>
        prev?.width === next.width && prev.maxHeight === next.maxHeight && prev.wide === next.wide ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ready]);

  let should: boolean | null = false;
  if (rowCount > 3) {
    if (!geometry) should = null;
    else {
      const gap = 12;
      const cardWidth = Math.max(72, (geometry.width - 8 - (cols - 1) * gap) / cols);
      const rowHeight = withThumbs ? cardWidth * (9 / 16) + (hasTitles ? 28 : 0) + 2 : geometry.wide ? 96 : 80;
      should = rowCount * rowHeight + (rowCount - 1) * gap > geometry.maxHeight;
    }
  }
  return { should, containerRef };
}

import { useEffect, useState, useRef } from 'react';

export function useShouldVirtualize(rowCount: number, cols: number, withThumbs: boolean, hasTitles: boolean) {
  const [should, setShould] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const calc = () => {
      if (rowCount === 0) {
        setShould(false);
        return;
      }
      const gap = 12;
      let rowH: number;
      if (withThumbs) {
        // 8 = pr-2 del contenedor, 28 = título, 2 = bordes; miniatura 16:9.
        const width = Math.max(0, (containerRef.current?.clientWidth ?? 0) - 8);
        const cardW = Math.max(72, (width - (cols - 1) * gap) / cols);
        rowH = cardW * (9 / 16) + (hasTitles ? 28 : 0) + 2;
      } else {
        rowH = window.innerWidth >= 640 ? 96 : 80;
      }
      const estimated = rowCount * rowH + Math.max(0, rowCount - 1) * gap;
      setShould(estimated > window.innerHeight * 0.55 && rowCount > 3);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [rowCount, cols, withThumbs, hasTitles]);
  return { should, containerRef };
}

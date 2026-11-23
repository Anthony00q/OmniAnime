import { useEffect, useState } from 'react';

function readColumns(): number {
  const width = window.innerWidth;
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  return width >= 640 ? 3 : 2;
}

export function useGridCols(): number {
  const [cols, setCols] = useState(readColumns);
  useEffect(() => {
    const update = () => setCols(readColumns());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return cols;
}

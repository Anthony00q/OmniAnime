import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Virtualizer } from 'virtua';
import { POSTER_GRID_CLASSES } from '@/renderer/components/anime/PosterGrid';

interface VirtualCatalogGridProps<T> {
  items: T[];
  scrollRef: RefObject<HTMLDivElement | null>;
  getKey: (item: T) => string | null;
  renderItem: (item: T, index: number) => ReactNode;
}

export function VirtualCatalogGrid<T>({ items, scrollRef, getKey, renderItem }: VirtualCatalogGridProps<T>) {
  const probeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusToRestore = useRef<number | null>(null);
  const [geometry, setGeometry] = useState({ columns: 2, rowHeight: 300 });
  const measuredGeometry = useRef(geometry);
  const [focused, setFocused] = useState<number | null>(null);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const measure = () => {
      const style = getComputedStyle(probe);
      const columns = style.gridTemplateColumns.split(' ').length;
      const width = probe.getBoundingClientRect().width;
      if (!width) return;
      const gap = parseFloat(style.columnGap) || 0;
      const rowHeight = ((width - gap * (columns - 1)) / columns) * 1.5 + 24;
      if (measuredGeometry.current.columns === columns && measuredGeometry.current.rowHeight === rowHeight) return;
      measuredGeometry.current = { columns, rowHeight };
      const active = document.activeElement?.closest<HTMLElement>('[data-catalog-index]');
      if (active && rootRef.current?.contains(active)) focusToRestore.current = Number(active.dataset.catalogIndex);
      setGeometry({ columns, rowHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useLayoutEffect(() => {
    if (focusToRestore.current === null) return;
    let frame = 0;
    const deadline = performance.now() + 1000;
    const restore = () => {
      const index = focusToRestore.current;
      if (index === null) return;
      const button = rootRef.current?.querySelector<HTMLButtonElement>(`[data-catalog-index="${index}"] > button`);
      const active = document.activeElement;
      if (active && active !== document.body && active !== button) {
        focusToRestore.current = null;
        return;
      }
      button?.focus({ preventScroll: true });
      if (button === document.activeElement || performance.now() >= deadline) focusToRestore.current = null;
      else frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [geometry]);

  const rows = useMemo(() => {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += geometry.columns) {
      result.push(items.slice(index, index + geometry.columns));
    }
    return result;
  }, [items, geometry.columns]);
  const keepMounted = focused !== null && focused < items.length ? [Math.floor(focused / geometry.columns)] : [];

  return (
    <div
      ref={rootRef}
      className="pt-2"
      onFocusCapture={(event) => {
        const item = (event.target as HTMLElement).closest<HTMLElement>('[data-catalog-index]');
        if (item) setFocused(Number(item.dataset.catalogIndex));
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
      }}
    >
      <div ref={probeRef} className={POSTER_GRID_CLASSES} aria-hidden="true" />
      <Virtualizer
        key={`${geometry.columns}:${geometry.rowHeight}`}
        scrollRef={scrollRef}
        data={rows}
        itemSize={geometry.rowHeight}
        startMargin={8}
        bufferSize={geometry.rowHeight * 2}
        keepMounted={keepMounted}
      >
        {(row, rowIndex) => (
          <div
            key={getKey(row[0]) ?? rowIndex}
            className={POSTER_GRID_CLASSES}
            style={{
              height: geometry.rowHeight - (rowIndex === rows.length - 1 ? 24 : 0),
              paddingBottom: rowIndex === rows.length - 1 ? 0 : 24,
            }}
          >
            {row.map((item, column) => {
              const index = rowIndex * geometry.columns + column;
              return (
                <div key={getKey(item) ?? index} data-catalog-index={index} className="min-w-0 [&>button]:block">
                  {renderItem(item, index)}
                </div>
              );
            })}
          </div>
        )}
      </Virtualizer>
    </div>
  );
}

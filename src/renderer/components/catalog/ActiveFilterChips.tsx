import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AppTooltip } from '../ui/AppTooltip';

interface ActiveFilterChip {
  key: string;
  value: unknown;
  label?: string;
}

interface ActiveFilterChipsProps {
  filters: ActiveFilterChip[];
  onRemove: (key: string) => void;
  onClear: () => void;
}

const FILTER_CHIP_EXIT_DURATION = 150;

export function ActiveFilterChips({ filters, onRemove, onClear }: ActiveFilterChipsProps) {
  const [renderedFilters, setRenderedFilters] = useState<ActiveFilterChip[]>(filters);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const renderedFiltersRef = useRef(filters);
  const activeKeysRef = useRef(new Set(filters.map(({ key }) => key)));
  const hiddenKeysRef = useRef(new Set<string>());
  const removalTimersRef = useRef(new Map<string, number>());
  const enteringFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const nextByKey = new Map(filters.map((filter) => [filter.key, filter]));
    const nextKeys = new Set(nextByKey.keys());
    const previousFilters = renderedFiltersRef.current;
    const previousKeys = new Set(previousFilters.map(({ key }) => key));

    activeKeysRef.current = nextKeys;

    const nextRenderedFilters = previousFilters.map((filter) => nextByKey.get(filter.key) ?? filter);
    const renderedKeys = new Set(nextRenderedFilters.map(({ key }) => key));
    filters.forEach((filter) => {
      if (!renderedKeys.has(filter.key)) {
        nextRenderedFilters.push(filter);
      }
    });

    const renderedFiltersChanged =
      previousFilters.length !== nextRenderedFilters.length ||
      previousFilters.some(
        (filter, index) =>
          filter.key !== nextRenderedFilters[index]?.key || filter.value !== nextRenderedFilters[index]?.value,
      );

    renderedFiltersRef.current = nextRenderedFilters;
    if (renderedFiltersChanged) {
      setRenderedFilters(nextRenderedFilters);
    }

    const commitHiddenKeys = (nextHiddenKeys: Set<string>) => {
      hiddenKeysRef.current = nextHiddenKeys;
      setHiddenKeys(new Set(nextHiddenKeys));
    };

    const reappearedKeys = filters
      .filter((filter) => previousKeys.has(filter.key) && removalTimersRef.current.has(filter.key))
      .map(({ key }) => key);
    for (const key of reappearedKeys) {
      const timer = removalTimersRef.current.get(key);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        removalTimersRef.current.delete(key);
      }
    }

    const addedKeys = filters.filter((filter) => !previousKeys.has(filter.key)).map(({ key }) => key);
    const removedKeys = [
      ...new Set(previousFilters.filter((filter) => !nextKeys.has(filter.key)).map(({ key }) => key)),
    ];
    const nextHiddenKeys = new Set(hiddenKeysRef.current);

    reappearedKeys.forEach((key) => nextHiddenKeys.delete(key));
    addedKeys.forEach((key) => nextHiddenKeys.add(key));
    removedKeys.forEach((key) => nextHiddenKeys.add(key));
    commitHiddenKeys(nextHiddenKeys);

    if (addedKeys.length > 0 && enteringFrameRef.current === null) {
      enteringFrameRef.current = window.requestAnimationFrame(() => {
        enteringFrameRef.current = null;
        const keysToReveal = new Set(hiddenKeysRef.current);
        keysToReveal.forEach((key) => {
          if (activeKeysRef.current.has(key) && !removalTimersRef.current.has(key)) {
            keysToReveal.delete(key);
          }
        });
        commitHiddenKeys(keysToReveal);
      });
    }

    for (const key of removedKeys) {
      const previousTimer = removalTimersRef.current.get(key);
      if (previousTimer !== undefined) {
        window.clearTimeout(previousTimer);
      }

      const timer = window.setTimeout(() => {
        removalTimersRef.current.delete(key);
        if (activeKeysRef.current.has(key)) return;

        const remainingFilters = renderedFiltersRef.current.filter((filter) => filter.key !== key);
        renderedFiltersRef.current = remainingFilters;
        setRenderedFilters(remainingFilters);

        const nextKeysAfterRemoval = new Set(hiddenKeysRef.current);
        nextKeysAfterRemoval.delete(key);
        commitHiddenKeys(nextKeysAfterRemoval);
      }, FILTER_CHIP_EXIT_DURATION);

      removalTimersRef.current.set(key, timer);
    }
  }, [filters]);

  useEffect(() => {
    const removalTimers = removalTimersRef.current;

    return () => {
      removalTimers.forEach((timer) => window.clearTimeout(timer));
      if (enteringFrameRef.current !== null) {
        window.cancelAnimationFrame(enteringFrameRef.current);
      }
    };
  }, []);

  const hasRenderedFilters = renderedFilters.length > 0;

  return (
    <div
      className="catalog-filter-chips-shell"
      data-state={hasRenderedFilters ? 'open' : 'closed'}
      aria-hidden={!hasRenderedFilters}
      inert={!hasRenderedFilters ? true : undefined}
    >
      <div className="catalog-filter-chips-content">
        <div className="flex flex-wrap gap-2">
          {renderedFilters.map(({ key, value, label }) => {
            const isVisible = !hiddenKeys.has(key);
            const chipLabel =
              label ??
              (key === 'genre' && Array.isArray(value)
                ? `${value.length} ${value.length === 1 ? 'género' : 'géneros'}`
                : key === 'minYear' || key === 'maxYear'
                  ? `Año ${value}`
                  : typeof value === 'string'
                    ? value
                    : String(value));

            return (
              <AppTooltip key={key} content={chipLabel}>
                <button
                  type="button"
                  onClick={() => onRemove(key)}
                  aria-hidden={!isVisible}
                  aria-label={`Quitar filtro ${chipLabel}`}
                  tabIndex={isVisible ? 0 : -1}
                  data-state={isVisible ? 'visible' : 'hidden'}
                  className="catalog-filter-chip group inline-flex max-w-full items-center gap-1 rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary shadow-sm hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <span className="max-w-[240px] truncate">{chipLabel}</span>
                  <X className="h-3 w-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
                </button>
              </AppTooltip>
            );
          })}

          {renderedFilters.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              aria-hidden={filters.length === 0}
              tabIndex={filters.length > 0 ? 0 : -1}
              data-state={hasRenderedFilters && filters.length > 0 ? 'visible' : 'hidden'}
              className="catalog-filter-chip inline-flex items-center gap-1 rounded-full border border-destructive/15 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive-fg hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
            >
              Limpiar todo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

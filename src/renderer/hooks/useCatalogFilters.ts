import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { pendingCatalogGenreAtom } from '../store/atoms';
import { createDefaultCatalogFilters, resolveFilterChipLabel } from '../utils/catalogFilters';
import { useFiltersData } from './useQueries';

export function useCatalogFilters() {
  const { data: filterData } = useFiltersData();
  const [pendingCatalogGenre, setPendingCatalogGenre] = useAtom(pendingCatalogGenreAtom);
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>(createDefaultCatalogFilters);
  const [localMinYear, setLocalMinYear] = useState<number | null>(null);
  const [localMaxYear, setLocalMaxYear] = useState<number | null>(null);
  const hasInitializedYearsRef = useRef(false);

  const applyPendingGenre = useCallback(
    (genreName: string | null) => {
      if (!genreName || !filterData?.genres) return;
      const g = filterData.genres.find((x: any) => x.name.toLowerCase() === genreName.toLowerCase());
      if (g) {
        setActiveFilters((prev) => ({ ...prev, genre: [g.id] }));
      }
      setPendingCatalogGenre(null);
    },
    [filterData, setPendingCatalogGenre],
  );

  useEffect(() => {
    if (
      !hasInitializedYearsRef.current &&
      filterData?.years &&
      filterData.years.length > 0 &&
      filterData.yearMode !== 'single'
    ) {
      const min = Math.min(...filterData.years);
      const max = Math.max(...filterData.years);
      setLocalMinYear(min);
      setLocalMaxYear(max);
      hasInitializedYearsRef.current = true;
    }
    if (pendingCatalogGenre) {
      applyPendingGenre(pendingCatalogGenre);
    }
  }, [filterData, pendingCatalogGenre, applyPendingGenre]);

  const resetForProviderChange = useCallback(() => {
    setActiveFilters(createDefaultCatalogFilters());
    setLocalMinYear(null);
    setLocalMaxYear(null);
    hasInitializedYearsRef.current = false;
  }, []);

  const updateFilter = useCallback((key: string, value: any) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleGenre = useCallback((genreId: string) => {
    setActiveFilters((prev) => {
      const genres = prev.genre as string[];
      const isSelected = genres.includes(genreId);
      return {
        ...prev,
        genre: isSelected ? genres.filter((g) => g !== genreId) : [...genres, genreId],
      };
    });
  }, []);

  const updateFilterRange = useCallback(
    (min: number, max: number) => {
      let minStr = min.toString();
      let maxStr = max.toString();
      if (filterData && filterData.years && filterData.years.length > 0) {
        if (min === Math.min(...filterData.years)) minStr = '';
        if (max === Math.max(...filterData.years)) maxStr = '';
      }
      setActiveFilters((prev) => ({ ...prev, minYear: minStr, maxYear: maxStr }));
    },
    [filterData],
  );

  const commitYearRange = useCallback(() => {
    if (localMinYear !== null && localMaxYear !== null) {
      updateFilterRange(localMinYear, localMaxYear);
    }
  }, [localMinYear, localMaxYear, updateFilterRange]);

  const clearFilters = useCallback(() => {
    setActiveFilters(createDefaultCatalogFilters());
    if (filterData?.years && filterData.years.length > 0) {
      setLocalMinYear(Math.min(...filterData.years));
      setLocalMaxYear(Math.max(...filterData.years));
    }
  }, [filterData]);

  const removeFilter = useCallback(
    (key: string) => {
      if (key === 'minYear' || key === 'maxYear' || key === 'search') {
        updateFilter(key, '');
      } else if (key === 'genre') {
        updateFilter(key, []);
      } else {
        updateFilter(key, '');
      }
      if (key === 'minYear' && filterData?.years?.length) {
        setLocalMinYear(Math.min(...filterData.years));
      }
      if (key === 'maxYear' && filterData?.years?.length) {
        setLocalMaxYear(Math.max(...filterData.years));
      }
    },
    [filterData, updateFilter],
  );

  const activeFilterChips = useMemo(
    () =>
      Object.entries(activeFilters)
        .filter(([key, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          if (key === 'search') return false;
          return value !== '' && value !== undefined && value !== null;
        })
        .map(([key, value]) => ({ key, value, label: resolveFilterChipLabel(key, value, filterData) })),
    [activeFilters, filterData],
  );

  return {
    filterData,
    activeFilters,
    setActiveFilters,
    localMinYear,
    setLocalMinYear,
    localMaxYear,
    setLocalMaxYear,
    pendingCatalogGenre,
    applyPendingGenre,
    resetForProviderChange,
    updateFilter,
    toggleGenre,
    updateFilterRange,
    commitYearRange,
    clearFilters,
    removeFilter,
    activeFilterChips,
  };
}

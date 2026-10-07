import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAtom } from 'jotai';
import { catalogSnapshotsAtom } from '@/renderer/store/atoms';
import { readCatalogSnapshot, writeCatalogSnapshot } from '@/renderer/utils/catalogFilters';

// Estado del catálogo por proveedor: vive en el átomo para sobrevivir al
// desmontaje de la vista (navegar a otra sección y volver no pierde los filtros).
export function useCatalogFilters(providerId: string) {
  const [snapshots, setSnapshots] = useAtom(catalogSnapshotsAtom);
  const snapshot = readCatalogSnapshot(snapshots, providerId);

  const setActiveFilters = useCallback<Dispatch<SetStateAction<Record<string, unknown>>>>(
    (action) => {
      setSnapshots((prev) => {
        const current = readCatalogSnapshot(prev, providerId);
        const filters = typeof action === 'function' ? action(current.filters) : action;
        return writeCatalogSnapshot(prev, providerId, { ...current, filters });
      });
    },
    [providerId, setSnapshots],
  );

  const setSearchInput = useCallback<Dispatch<SetStateAction<string>>>(
    (action) => {
      setSnapshots((prev) => {
        const current = readCatalogSnapshot(prev, providerId);
        const searchInput = typeof action === 'function' ? action(current.searchInput) : action;
        return writeCatalogSnapshot(prev, providerId, { ...current, searchInput });
      });
    },
    [providerId, setSnapshots],
  );

  return {
    activeFilters: snapshot.filters,
    setActiveFilters,
    searchInput: snapshot.searchInput,
    setSearchInput,
  };
}

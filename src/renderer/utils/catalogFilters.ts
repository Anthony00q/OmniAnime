export const DEFAULT_CATALOG_FILTERS = {
  search: '',
  category: '',
  genre: [] as string[],
  status: '',
  order: '',
  minYear: '',
  maxYear: '',
  year: '',
  letter: '',
  demographic: '',
  type: '',
  season: '',
  orderDir: '',
} as const;

export function createDefaultCatalogFilters(): Record<string, unknown> {
  return {
    ...DEFAULT_CATALOG_FILTERS,
    genre: [],
  };
}

interface FilterListItem {
  id: string;
  name: string;
}

interface FilterLists {
  categories?: FilterListItem[];
  genres?: FilterListItem[];
  statuses?: FilterListItem[];
  orders?: FilterListItem[];
  orderDirs?: FilterListItem[];
  letters?: FilterListItem[];
  demographics?: FilterListItem[];
  types?: FilterListItem[];
  seasons?: FilterListItem[];
}

/** "tv-anime" -> "Tv Anime". Solo fallback cuando el id no se resuelve en filterData. */
export function humanizeFilterId(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function findFilterName(list: FilterListItem[] | undefined, id: string): string | undefined {
  return list?.find((item) => item.id === id)?.name;
}

/**
 * Resuelve la etiqueta legible de un chip de filtro a partir de filterData.
 * Si el id no se encuentra (data aún cargando, proveedor cambiado), usa
 * humanizeFilterId para no mostrar nunca el id crudo ("tv-anime").
 */
export function resolveFilterChipLabel(key: string, value: unknown, filterData?: FilterLists | null): string {
  if (key === 'minYear' || key === 'maxYear' || key === 'year') return `Año ${String(value)}`;
  if (key === 'genre' && Array.isArray(value)) {
    const names = (value as unknown[]).map((id) => {
      const raw = String(id);
      return findFilterName(filterData?.genres, raw) ?? humanizeFilterId(raw);
    });
    return names.join(', ');
  }
  if (typeof value !== 'string') return String(value);
  const listByKey: Record<string, FilterListItem[] | undefined> = {
    category: filterData?.categories,
    status: filterData?.statuses,
    order: filterData?.orders,
    orderDir: filterData?.orderDirs,
    letter: filterData?.letters,
    demographic: filterData?.demographics,
    type: filterData?.types,
    season: filterData?.seasons,
  };
  return findFilterName(listByKey[key], value) ?? humanizeFilterId(value);
}

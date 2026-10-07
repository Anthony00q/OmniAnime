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

export interface CatalogFiltersSnapshot {
  filters: Record<string, unknown>;
  searchInput: string;
}

export type CatalogSnapshotMap = Record<string, CatalogFiltersSnapshot>;

export function createDefaultCatalogSnapshot(): CatalogFiltersSnapshot {
  return { filters: createDefaultCatalogFilters(), searchInput: '' };
}

// Default compartido y congelado: leer un proveedor sin guardar debe devolver
// siempre el mismo objeto para no romper la estabilidad de claves/memos.
const EMPTY_CATALOG_SNAPSHOT: CatalogFiltersSnapshot = Object.freeze({
  filters: Object.freeze({ ...createDefaultCatalogFilters(), genre: Object.freeze([]) }),
  searchInput: '',
});

export function readCatalogSnapshot(map: CatalogSnapshotMap, providerId: string): CatalogFiltersSnapshot {
  return map[providerId] ?? EMPTY_CATALOG_SNAPSHOT;
}

export function writeCatalogSnapshot(
  map: CatalogSnapshotMap,
  providerId: string,
  snapshot: CatalogFiltersSnapshot,
): CatalogSnapshotMap {
  return { ...map, [providerId]: snapshot };
}

export function parseCatalogYear(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Límites visibles de los sliders de año: lo guardado en los filtros, acotado
 * al rango del proveedor; sin nada guardado, el rango completo.
 */
export function resolveCatalogYearBounds(
  filters: Record<string, unknown>,
  years: number[] | undefined,
): { min: number | null; max: number | null } {
  if (!years || years.length === 0) return { min: null, max: null };
  const rangeMin = Math.min(...years);
  const rangeMax = Math.max(...years);
  const savedMin = parseCatalogYear(filters.minYear);
  const savedMax = parseCatalogYear(filters.maxYear);
  const clamp = (v: number) => Math.min(Math.max(v, rangeMin), rangeMax);
  return {
    min: savedMin === null ? rangeMin : clamp(savedMin),
    max: savedMax === null ? rangeMax : clamp(savedMax),
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

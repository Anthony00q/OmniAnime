export interface AnimeSearchResult {
  id: string;
  title: string;
  slug: string;
  poster: string | null;
  category?: string;
  year?: string;
  score?: string;
  status?: string;
  synopsis?: string;
}

export interface AnimeRelation {
  id: string;
  slug: string;
  title: string;
  type: string;
  poster: string;
}

// DUB desactivado: solo SUB
export type AnimeLanguage = 'SUB' | 'DUB';

export interface AnimeDetails {
  id: string;
  title: string;
  slug: string;
  description: string;
  poster: string | null;
  banner?: string | null;
  episodes: number[];
  relations: AnimeRelation[];
  genres: string[];
  status: string;
  year: string;
  category: string;
  japaneseTitle: string;
  alternativeTitles?: string[];
  season: string;
  score: number;
  votes: number;
  availableLanguages: AnimeLanguage[];
  studio: string;
  type: string;
  episodeThumbnails?: Record<number, string>;
}

export type DownloadAnimeDetails = AnimeDetails & {
  banner?: string | null;
  downloadSourceSlug?: string | null;
  downloadSourceTitle?: string | null;
};

export interface DownloadLink {
  server: string;
  url: string;
  // DUB desactivado: solo SUB
  lang?: 'SUB' | 'DUB';
}

export interface HomeEpisode {
  title: string;
  slug: string;
  episode: string;
  poster: string;
  timeAgo: string;
}

export interface AnimeSearchFilters {
  genre?: string[];
  category?: string;
  status?: string;
  order?: string;
  page?: number;
  year?: string;
  minYear?: number;
  maxYear?: number;
  search?: string;
  letter?: string;
  demographic?: string;
  type?: string;
  season?: string;
  orderDir?: string;
}

export interface CatalogFilters {
  page?: number;
  order?: string;
  status?: string;
  category?: string;
  genre?: string[];
  minYear?: number | string;
  maxYear?: number | string;
  search?: string;
  // Filtros soportados por AnimeAV1 (?letter=A)
  letter?: string;
  // Filtros específicos de JkAnime (ignorados por AnimeAV1)
  year?: string;
  demographic?: string;
  type?: string;
  season?: string;
  orderDir?: string;
}

export interface FilterItem {
  id: string;
  name: string;
}

export interface CatalogFiltersData {
  categories: FilterItem[];
  genres: FilterItem[];
  years: number[];
  statuses?: FilterItem[];
  orders?: FilterItem[];
  yearMode?: 'range' | 'single';
  letters?: FilterItem[];
  demographics?: FilterItem[];
  types?: FilterItem[];
  seasons?: FilterItem[];
  orderDirs?: FilterItem[];
}

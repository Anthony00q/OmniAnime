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
  malId?: number | null;
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
  // Sección del home (Jkanime). Sin setear se trata como 'anime'.
  kind?: HomeEpisodeKind;
}

export type HomeEpisodeKind = 'anime' | 'donghua' | 'ova';

// Horario semanal de emisión: una entrada por anime y día.
export interface ScheduleEntry {
  slug: string;
  title: string;
  poster: string;
  // Día ISO de la semana en hora local: 1=Lunes … 7=Domingo.
  day: number;
  // Hora local "HH:mm" aproximada; null si la fuente no publica hora.
  time: string | null;
  // Episodio que anuncia la fila (último capítulo publicado en JkAnime);
  // null cuando la fuente no muestra episodio en su horario (AnimeAV1).
  episode: number | null;
  // ISO del último episodio publicado; null si la fuente no lo da.
  updatedAt: string | null;
  // Frescura publicada por la fuente ("hace 6 días"); null si no la da.
  note: string | null;
  finished: boolean;
}

export interface ScheduleData {
  entries: ScheduleEntry[];
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

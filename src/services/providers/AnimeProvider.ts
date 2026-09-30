import {
  AnimeSearchResult,
  AnimeDetails,
  DownloadLink,
  HomeEpisode,
  CatalogFiltersData,
  ScheduleData,
} from '../../types/anime';

export interface AnimeProvider {
  get id(): string;
  get name(): string;
  getHome(forceRefresh?: boolean): Promise<HomeEpisode[]>;
  // Null solo ante fallo (la vista muestra error); lista vacía es "sin programación".
  getSchedule(force?: boolean): Promise<ScheduleData | null>;
  getCatalog(filters?: any, force?: boolean): Promise<AnimeSearchResult[]>;
  search(query: string): Promise<AnimeSearchResult[]>;
  getDetails(slug: string): Promise<AnimeDetails | null>;
  getLinks(slug: string, episode: number, lang?: string, signal?: AbortSignal): Promise<DownloadLink[]>;
  getFiltersData(force?: boolean): Promise<CatalogFiltersData>;
}

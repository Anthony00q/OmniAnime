import {
  AnimeSearchResult,
  AnimeDetails,
  DownloadLink,
  HomeEpisode,
  CatalogFiltersData,
  ScheduleData,
} from '../../types/anime';
import type { ScopedLogger } from '../logging/AppLogger';

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

export interface ProviderCapabilities {
  search: boolean;
  homeFeed: boolean;
  schedule: boolean;
  episodeLinks: boolean;
}

// Contrato ampliado que exporta cada `providers/<name>/index.ts`: identidad,
// capacidades y fábrica de su AnimeProvider. Es lo que descubre el registry.
export interface ProviderModule {
  id: string;
  label: string;
  icon: string;
  capabilities: ProviderCapabilities;
  create(options?: { logger?: ScopedLogger }): AnimeProvider;
}

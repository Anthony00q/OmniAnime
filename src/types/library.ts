export interface LibraryMetaPreloadRow {
  folderName: string;
  folderPath: string;
  sourceDir: string;
  sourceDirIndex: number;
  birthtime: number;
  episodeCount: number;
  slug: string | null;
  title: string;
  secondaryTitle?: string;
  alternativeTitles?: string[];
  poster: string | null;
  banner: string | null;
  category?: string;
  year?: string;
  status?: string;
  season?: string;
  providerId?: string | null;
  anilistId?: number | null;
  hasProviderMetadata?: boolean;
  lang?: 'SUB' | 'DUB';
  updatedAt: number;
}

export interface FolderLibraryMeta {
  slug?: string | null;
  title?: string;
  secondaryTitle?: string;
  alternativeTitles?: string[];
  category?: string;
  year?: string;
  status?: string;
  season?: string;
  updatedAt?: number;
  posterUrl?: string | null;
  bannerUrl?: string | null;
  providerId?: string | null;
  lang?: 'SUB' | 'DUB';
  anilistId?: number | null;
  folderPath?: string;
}

export interface LibraryMetadataRequest {
  folderPath: string;
  providerId: string;
  slug: string;
  refresh?: boolean;
}

export interface LibraryMetadataPreview {
  token: string;
  folderPath: string;
  current: FolderLibraryMeta | null;
  proposed: FolderLibraryMeta;
  warnings: string[];
}

export interface LibraryMetadataResult {
  folderPath: string;
  meta: FolderLibraryMeta;
  warnings: string[];
}

export interface FolderRenamePreview {
  name: string;
  revision: string;
  available: boolean;
  meta: FolderLibraryMeta | null;
}

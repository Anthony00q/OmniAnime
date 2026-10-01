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
  folderPath?: string;
}

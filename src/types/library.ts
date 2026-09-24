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

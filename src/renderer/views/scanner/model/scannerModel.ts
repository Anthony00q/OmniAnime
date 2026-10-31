import type { LibraryFolder } from '@/services/library/LibraryFileService';
import {
  buildLibrarySearchIndex,
  filterLibraryIndex,
  normalizeLibraryText,
  type LibrarySearchEntry,
} from '@/renderer/utils/libraryFilter';
import { resolveScannerRelinkProvider } from './relinkPolicy';

export type ScannerFolder = LibraryFolder & { poster?: string | null };
export type ScannerStatusFilter = 'all' | 'missing' | 'linked';

export function buildScannerSearchIndex(folders: readonly ScannerFolder[]): LibrarySearchEntry<ScannerFolder>[] {
  return buildLibrarySearchIndex(folders).map((entry) => ({
    item: entry.item,
    text: `${entry.text} ${normalizeLibraryText(getScannerFolderTitle(entry.item))}`,
  }));
}

export function getScannerFolderTitle(folder: ScannerFolder): string {
  return (
    (folder.metaSlug && folder.metaTitle) ||
    folder.name
      .replace(/[_-]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() ||
    folder.name
  );
}

export function getScannerProviderLabel(folder: ScannerFolder, activeProvider: string): string {
  const provider = resolveScannerRelinkProvider(folder, activeProvider) ?? folder.providerId ?? 'animeav1';
  return provider === 'jkanime' ? 'JkAnime' : provider === 'animeav1' ? 'AnimeAV1' : 'Desconocido';
}

export function filterScannerFolders(
  index: readonly LibrarySearchEntry<ScannerFolder>[],
  dir: string,
  query: string,
  status: ScannerStatusFilter,
): ScannerFolder[] {
  return filterLibraryIndex(index, dir, query)
    .filter((folder) => status === 'all' || (status === 'linked' ? Boolean(folder.metaSlug) : !folder.metaSlug))
    .sort((a, b) => Number(Boolean(a.metaSlug)) - Number(Boolean(b.metaSlug)));
}

export function getScannerCounts(folders: readonly ScannerFolder[]): Record<ScannerStatusFilter, number> {
  const linked = folders.filter((folder) => Boolean(folder.metaSlug)).length;
  return { all: folders.length, missing: folders.length - linked, linked };
}

export function resolveScannerSelection(folders: readonly ScannerFolder[], path: string | null): ScannerFolder | null {
  return folders.find((folder) => folder.path === path) ?? folders[0] ?? null;
}

export function getScannerDirectoryLabel(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() || dir;
}

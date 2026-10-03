import {
  buildFolderName,
  extractFolderNameYear,
  listFolderNameCandidates,
  nextAvailableFolderName,
  type AniListFolderTitles,
  type FolderCandidateKey,
  type FolderNameSource,
} from '@/utils/downloads/folderNaming';

export interface FolderRenameMeta {
  title?: string | null;
  secondaryTitle?: string | null;
  alternativeTitles?: Array<string | null | undefined> | null;
  year?: string | number | null;
  category?: string | null;
  season?: string | null;
}

// Input de AniList para el rename; formato y temporada de la meta ayudan a desempatar.
export interface FolderAniListInput {
  title: string;
  alternativeTitles: Array<string | null | undefined> | null;
  providerYear: string | number | null;
  providerFormat: string | null;
  providerSeason: string | null;
}

export function anilistInputFromFolderMeta(meta: FolderRenameMeta | null): FolderAniListInput {
  return {
    title: meta?.title ?? '',
    alternativeTitles: meta?.alternativeTitles ?? null,
    providerYear: meta?.year ?? null,
    providerFormat: meta?.category ?? null,
    providerSeason: meta?.season ?? null,
  };
}

export interface FolderRenameEntry {
  folderPath: string;
  folderName: string;
  meta: FolderRenameMeta | null;
}

export interface FolderRenamePlanItem {
  folderPath: string;
  oldName: string;
  newName: string;
  status: 'will_rename' | 'unchanged' | 'conflict';
}

// Mismo nombre que el encolado; colisiones entre carpetas con sufijo de año y luego numérico.
export function computeFolderRenamePlan(
  entries: FolderRenameEntry[],
  source: FolderNameSource,
  anilistTitles: Record<string, AniListFolderTitles | null | undefined>,
): FolderRenamePlanItem[] {
  const occupied = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.folderName.toLowerCase();
    if (!occupied.has(key)) occupied.set(key, entry.folderPath);
  }

  const plan: FolderRenamePlanItem[] = [];
  for (const entry of entries) {
    const meta = entry.meta || {};
    const base = buildFolderName(
      {
        providerTitle: meta.title ?? null,
        providerAlternativeTitles: meta.alternativeTitles ?? null,
        japaneseTitle: meta.secondaryTitle ?? null,
        anilist: anilistTitles[entry.folderPath] ?? null,
        year: meta.year ?? null,
      },
      source,
    );
    let newName = base;
    let status: FolderRenamePlanItem['status'] = base === entry.folderName ? 'unchanged' : 'will_rename';
    try {
      newName = nextAvailableFolderName(base, extractFolderNameYear(meta.year ?? null), (name) => {
        const owner = occupied.get(name.toLowerCase());
        return Boolean(owner) && owner !== entry.folderPath;
      });
    } catch {
      status = 'conflict';
    }
    occupied.delete(entry.folderName.toLowerCase());
    occupied.set(newName.toLowerCase(), entry.folderPath);
    if (status !== 'conflict' && newName === entry.folderName) status = 'unchanged';
    plan.push({ folderPath: entry.folderPath, oldName: entry.folderName, newName, status });
  }
  return plan;
}

export const FOLDER_CANDIDATE_LABELS: Record<FolderCandidateKey, string> = {
  provider: 'Proveedor (título)',
  'provider-alt': 'Proveedor (alternativo)',
  'anilist-romaji': 'AniList (romaji)',
  'anilist-english': 'AniList (inglés)',
  'anilist-native': 'AniList (japonés)',
  'anilist-synonym': 'AniList (sinónimo)',
  japanese: 'Japonés',
};

export interface FolderRenameCandidate {
  key: FolderCandidateKey;
  label: string;
  name: string;
}

// Candidatos para el renombrado manual de una carpeta.
export function folderRenameCandidates(
  entry: FolderRenameEntry,
  anilistTitles: AniListFolderTitles | null | undefined,
): FolderRenameCandidate[] {
  return listFolderNameCandidates({
    providerTitle: entry.meta?.title ?? null,
    providerAlternativeTitles: entry.meta?.alternativeTitles ?? null,
    japaneseTitle: entry.meta?.secondaryTitle ?? null,
    anilist: anilistTitles ?? null,
    year: entry.meta?.year ?? null,
  }).map((candidate) => ({ ...candidate, label: FOLDER_CANDIDATE_LABELS[candidate.key] }));
}

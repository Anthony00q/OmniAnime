// Nombre de carpeta de descarga: qué título se usa, limpieza para Windows y colisiones.

export const FOLDER_NAME_SOURCES = [
  'anilist-romaji',
  'anilist-english',
  'anilist-native',
  'anilist-synonym',
  'provider',
  'provider-alt',
] as const;

export type FolderNameSource = (typeof FOLDER_NAME_SOURCES)[number];

export function normalizeFolderNameSource(raw: unknown): FolderNameSource {
  return (FOLDER_NAME_SOURCES as readonly string[]).includes(String(raw))
    ? (raw as FolderNameSource)
    : DEFAULT_FOLDER_NAME_SOURCE;
}

export type FolderCandidateKey = FolderNameSource | 'japanese';

export const DEFAULT_FOLDER_NAME_SOURCE: FolderNameSource = 'anilist-romaji';

export const FALLBACK_FOLDER_NAME = 'Sin_titulo';

export const MAX_FOLDER_NAME_LENGTH = 100;

export interface AniListFolderTitles {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  synonyms?: Array<string | null | undefined> | null;
}

export interface FolderNameCandidates {
  providerTitle?: string | null;
  providerAlternativeTitles?: Array<string | null | undefined> | null;
  japaneseTitle?: string | null;
  anilist?: AniListFolderTitles | null;
  year?: string | number | null;
}

const WINDOWS_ILLEGAL = /[<>:"/\\|?*]/g;
const CONTROL_CHARS = /\p{Cc}/gu;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const FALLBACK_CHAINS: Record<FolderNameSource, FolderCandidateKey[]> = {
  'anilist-romaji': ['anilist-romaji', 'anilist-english', 'provider', 'anilist-native', 'japanese', 'anilist-synonym'],
  'anilist-english': ['anilist-english', 'anilist-romaji', 'provider', 'anilist-native', 'japanese', 'anilist-synonym'],
  'anilist-native': ['anilist-native', 'anilist-romaji', 'anilist-english', 'provider', 'japanese', 'anilist-synonym'],
  'anilist-synonym': ['anilist-synonym', 'anilist-romaji', 'anilist-english', 'provider', 'anilist-native', 'japanese'],
  provider: ['provider', 'anilist-romaji', 'anilist-english', 'anilist-native', 'japanese', 'anilist-synonym'],
  'provider-alt': ['provider-alt', 'provider', 'anilist-romaji', 'anilist-english', 'anilist-native', 'japanese'],
};

const CANDIDATE_DISPLAY_ORDER: FolderCandidateKey[] = [
  'provider',
  'provider-alt',
  'anilist-romaji',
  'anilist-english',
  'anilist-native',
  'japanese',
  'anilist-synonym',
];

function firstNonEmpty(values: Array<string | null | undefined> | null | undefined): string | null {
  for (const value of values || []) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function candidateRaw(candidates: FolderNameCandidates, key: FolderCandidateKey): string | null {
  switch (key) {
    case 'anilist-romaji':
      return firstNonEmpty([candidates.anilist?.romaji]);
    case 'anilist-english':
      return firstNonEmpty([candidates.anilist?.english]);
    case 'anilist-native':
      return firstNonEmpty([candidates.anilist?.native]);
    case 'anilist-synonym':
      return firstNonEmpty(candidates.anilist?.synonyms);
    case 'provider':
      return firstNonEmpty([candidates.providerTitle]);
    case 'provider-alt':
      return firstNonEmpty(candidates.providerAlternativeTitles);
    case 'japanese':
      return firstNonEmpty([candidates.japaneseTitle]);
    default:
      return null;
  }
}

export function sanitizeFolderName(raw: unknown): string {
  let name = String(raw ?? '')
    .normalize('NFC')
    .replace(WINDOWS_ILLEGAL, ' ')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (!name) return FALLBACK_FOLDER_NAME;
  const stem = name.split('.')[0] || name;
  if (RESERVED_NAMES.test(name) || RESERVED_NAMES.test(stem)) name = `${name}_`;
  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    const cut = name.slice(0, MAX_FOLDER_NAME_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    name = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[. ]+$/g, '');
  }
  return name || FALLBACK_FOLDER_NAME;
}

export function buildFolderName(candidates: FolderNameCandidates, source: FolderNameSource): string {
  const chain = FALLBACK_CHAINS[source] || FALLBACK_CHAINS[DEFAULT_FOLDER_NAME_SOURCE];
  for (const key of chain) {
    const name = sanitizeFolderName(candidateRaw(candidates, key));
    if (name !== FALLBACK_FOLDER_NAME) return name;
  }
  return FALLBACK_FOLDER_NAME;
}

export function listFolderNameCandidates(
  candidates: FolderNameCandidates,
): Array<{ key: FolderCandidateKey; name: string }> {
  const out: Array<{ key: FolderCandidateKey; name: string }> = [];
  for (const key of CANDIDATE_DISPLAY_ORDER) {
    const name = sanitizeFolderName(candidateRaw(candidates, key));
    if (name === FALLBACK_FOLDER_NAME) continue;
    if (out.some((entry) => entry.name === name)) continue;
    out.push({ key, name });
  }
  return out;
}

export function extractFolderNameYear(raw: string | number | null | undefined): string | null {
  const match = String(raw ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

export function nextAvailableFolderName(
  baseName: string,
  year: string | null,
  exists: (name: string) => boolean,
): string {
  if (!exists(baseName)) return baseName;
  if (year) {
    const withYear = `${baseName} (${year})`;
    if (!exists(withYear)) return withYear;
  }
  for (let n = 2; n <= 100; n += 1) {
    const candidate = `${baseName} (${n})`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error('No hay nombre de carpeta disponible para este anime');
}

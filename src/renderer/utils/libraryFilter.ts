export type LibrarySortKey = 'recientes' | 'az' | 'za' | 'mas-eps';

export function normalizeLibrarySort(value: unknown): LibrarySortKey {
  return value === 'az' || value === 'za' || value === 'mas-eps' ? value : 'recientes';
}

export function normalizeLibraryText(value: unknown): string {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD');
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x300 || code > 0x36f) out += ch;
  }
  return out;
}

export function getLibraryDisplayTitle(item: any): string {
  return String(item?.metaTitle || item?.name || '');
}

export function getLibrarySearchHaystack(item: any): string {
  const alts = Array.isArray(item?.alternativeTitles) ? item.alternativeTitles : [];
  return normalizeLibraryText([getLibraryDisplayTitle(item), item?.name ?? '', ...alts].join(' '));
}

function hasJapaneseScript(text: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿｀-ｯ]/.test(text);
}

export function getLibraryPrimaryAlternative(input: {
  title?: unknown;
  secondaryTitle?: unknown;
  alternativeTitles?: unknown;
  providerId?: unknown;
}): string {
  const main = normalizeLibraryText(input?.title);
  const stored = String(input?.secondaryTitle ?? '').trim();
  if (stored && normalizeLibraryText(stored) !== main) return stored;
  const raw = Array.isArray(input?.alternativeTitles) ? input.alternativeTitles : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const text = String(entry ?? '').trim();
    if (!text) continue;
    const key = normalizeLibraryText(text);
    if (!key || key === main || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
  }
  if (cleaned.length === 0) return '';
  if (input?.providerId === 'jkanime') return cleaned[0];
  return cleaned.find((t) => hasJapaneseScript(t)) ?? cleaned[0];
}

export interface LibraryFolderDetails {
  title: string;
  alternatives: string[];
  providerName: string;
  folderName: string;
  episodeCount: number | null;
}

export function formatLibraryFolderDetails(item: any): LibraryFolderDetails {
  const alternatives = Array.isArray(item?.alternativeTitles)
    ? (item.alternativeTitles as unknown[]).filter((v): v is string => typeof v === 'string' && !!v.trim())
    : [];
  return {
    title: getLibraryDisplayTitle(item),
    alternatives,
    providerName: item?.providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1',
    folderName: String(item?.name ?? ''),
    episodeCount: typeof item?.episodeCount === 'number' ? item.episodeCount : null,
  };
}

export function filterLibraryItems(items: any[], dirFilter: string, query: unknown): any[] {
  const normalized = normalizeLibraryText(query);
  return items.filter((item: any) => {
    if (dirFilter !== 'all' && item.sourceDir !== dirFilter) return false;
    if (!normalized) return true;
    return getLibrarySearchHaystack(item).includes(normalized);
  });
}

export function sortLibraryItems(items: any[], sortKey: LibrarySortKey): any[] {
  const sorted = [...items];
  if (sortKey === 'az') {
    sorted.sort((a, b) => getLibraryDisplayTitle(a).localeCompare(getLibraryDisplayTitle(b), 'es'));
  } else if (sortKey === 'za') {
    sorted.sort((a, b) => getLibraryDisplayTitle(b).localeCompare(getLibraryDisplayTitle(a), 'es'));
  } else if (sortKey === 'mas-eps') {
    sorted.sort(
      (a, b) =>
        (Number(b?.episodeCount) || 0) - (Number(a?.episodeCount) || 0) ||
        getLibraryDisplayTitle(a).localeCompare(getLibraryDisplayTitle(b), 'es'),
    );
  } else {
    sorted.sort((a, b) => (Number(b?.birthtime) || 0) - (Number(a?.birthtime) || 0));
  }
  return sorted;
}

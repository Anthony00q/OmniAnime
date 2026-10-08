export function normalizeTitleForMatch(title: string): string {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const MAX_FOLDER_ALTERNATIVE_TITLES = 4;

export function normalizeFolderAlternativeTitles(
  raw: unknown,
  mainTitle?: unknown,
  max: number = MAX_FOLDER_ALTERNATIVE_TITLES,
): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const main = String(mainTitle ?? '').trim();
  const out: string[] = [];
  for (const entry of list) {
    const title = String(entry ?? '').trim();
    if (!title) continue;
    if (main && title === main) continue;
    if (out.includes(title)) continue;
    out.push(title);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeDisplayAnimeTitle(title: string): string {
  const raw = String(title || '').trim();
  if (!raw) return raw;

  const normalized = raw
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!/[_]/.test(raw) && !/^[A-Z0-9 _-]+$/.test(raw)) {
    return normalized;
  }

  return normalized
    .replace(/\b([A-Z]{2,})\b/g, (match) => {
      if (match === 'OVA' || match === 'ONA' || match === 'TV') return match;
      if (match === 'II' || match === 'III' || match === 'IV') return match;
      return match.charAt(0) + match.slice(1).toLowerCase();
    })
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bX\b/g, 'x')
    .replace(/\bSpy X Family\b/g, 'Spy x Family')
    .replace(/\bTv\b/g, 'TV')
    .replace(/\bOva\b/g, 'OVA')
    .replace(/\bOna\b/g, 'ONA')
    .replace(/\bIi\b/g, 'II')
    .replace(/\bIii\b/g, 'III')
    .replace(/\bIv\b/g, 'IV')
    .trim();
}

export function formatEpisodeCountLabel(count: number, short = false): string {
  const total = Number(count) || 0;
  if (short) {
    return `${total} ${total === 1 ? 'ep' : 'eps'}`;
  }
  return `${total} ${total === 1 ? 'episodio' : 'episodios'}`;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function editSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return (1 - levenshteinDistance(a, b) / maxLen) * 100;
}

const SCORE_NOISE_FLOOR = 30;

export function computeTitleMatchScore(a: string, b: string): number {
  const aa = normalizeTitleForMatch(a);
  const bb = normalizeTitleForMatch(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 100;

  const at = new Set(aa.split(' ').filter(Boolean));
  const bt = new Set(bb.split(' ').filter(Boolean));
  if (!at.size || !bt.size) return 0;

  let common = 0;
  at.forEach((t) => {
    if (bt.has(t)) common += 1;
  });
  const union = new Set([...Array.from(at), ...Array.from(bt)]).size;

  const sortedA = Array.from(at).sort().join(' ');
  const sortedB = Array.from(bt).sort().join(' ');
  const score = Math.max(editSimilarity(aa, bb), editSimilarity(sortedA, sortedB), (common / union) * 100);
  return score < SCORE_NOISE_FLOOR ? 0 : Math.round(score);
}

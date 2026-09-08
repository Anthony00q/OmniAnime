export function normalizeTitleForMatch(title: string): string {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
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

export function computeTitleMatchScore(a: string, b: string): number {
  const aa = normalizeTitleForMatch(a);
  const bb = normalizeTitleForMatch(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 100;
  if (aa.startsWith(bb) || bb.startsWith(aa)) return 88;

  const at = new Set(aa.split(' ').filter(Boolean));
  const bt = new Set(bb.split(' ').filter(Boolean));
  if (!at.size || !bt.size) return 0;

  let common = 0;
  at.forEach((t) => {
    if (bt.has(t)) common += 1;
  });
  const union = new Set([...Array.from(at), ...Array.from(bt)]).size;
  return Math.round((common / union) * 72);
}

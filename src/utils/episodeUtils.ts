import * as path from 'path';
import anitomy from 'anitomy';

export type EpisodeNamingStyle = 'minimal' | 'descriptive';

export function extractEpisodeNumberFromVideoFileName(fileName: string): number | null {
  const base = path.parse(fileName).name;

  try {
    const parsed = anitomy.parse(fileName);
    if (parsed && parsed.episode?.number) {
      return parsed.episode.number;
    }
  } catch {}

  const taggedMatch = base.match(/(?:\bep\b|\bepisodio\b|\bepisode\b|\bcap(?:itulo)?\b)[\s._-]*0*(\d{1,4})\b/i);
  if (taggedMatch) {
    const n = parseInt(taggedMatch[1], 10);
    if (!isNaN(n)) return n;
  }

  const seasonEpMatch = base.match(/\bs\d{1,2}[\s._-]*e(\d{1,3})\b/i);
  if (seasonEpMatch) {
    const n = parseInt(seasonEpMatch[1], 10);
    if (!isNaN(n)) return n;
  }

  const allNums = (base.match(/\d{1,4}/g) || [])
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n))
    .filter((n) => !(n >= 1900 && n <= 2099));

  if (allNums.length === 0) return null;
  return allNums[allNums.length - 1];
}

export function buildCanonicalEpisodeFileName(
  episodeNumber: number,
  ext: string,
  folderName?: string,
  style: EpisodeNamingStyle = 'descriptive',
  lang?: 'SUB' | 'DUB',
): string {
  const safeExt = (ext || '.mp4').startsWith('.') ? ext.toLowerCase() : `.${String(ext).toLowerCase()}`;

  let prefix = 'EP_';
  if (style === 'descriptive' && folderName) {
    let cleanName = folderName.trim();
    if (cleanName.length > 40) {
      const truncated = cleanName.substring(0, 40);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 20) {
        cleanName = truncated.substring(0, lastSpace) + '...';
      } else {
        cleanName = truncated + '...';
      }
    }
    prefix = `${cleanName} EP_`;
  }

  // DUB desactivado: solo SUB
  const langSuffix = lang === 'DUB' ? '_DUB' : '';
  return `${prefix}${episodeNumber}${langSuffix}${safeExt}`;
}

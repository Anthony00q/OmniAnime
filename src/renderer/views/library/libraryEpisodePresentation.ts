export function buildLibraryEpisodeTitle(name: unknown, episodeNumber: number | null | undefined): string {
  const title = String(name ?? '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const numberOnly = title.match(/^(?:(?:ep(?:isodio|isode)?|cap(?:itulo|ítulo)?)\.?\s*)?(\d+)$/i);
  if (!title || (numberOnly && episodeNumber != null && Number(numberOnly[1]) === episodeNumber)) {
    return `Episodio ${episodeNumber ?? '?'}`;
  }
  return title;
}

export function buildLibraryEpisodeDetails(input: {
  name?: unknown;
  episodeNumber?: number | null;
  size?: unknown;
  ext?: unknown;
}) {
  const fileName = String(input.name ?? '').trim();
  const extension = String(input.ext ?? '').trim() || fileName.match(/\.([a-z0-9]+)$/i)?.[1] || '';
  return {
    episode: input.episodeNumber != null ? String(input.episodeNumber) : '—',
    fileName: fileName || '—',
    size: String(input.size ?? '').trim() || '—',
    format: extension.replace(/^\./, '').toUpperCase() || '—',
  };
}

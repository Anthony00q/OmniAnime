export function isEpisodeNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER &&
    /^\d+(?:\.\d+)?$/.test(String(value))
  );
}

export function parseEpisodeNumber(value: unknown): number | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    value = Number(text);
  }
  return isEpisodeNumber(value) ? value : null;
}

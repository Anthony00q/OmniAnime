export interface HlsMediaPlaylist {
  segments: string[];
  // Duración EXTINF en ms, en orden con `segments` (0 si falta).
  segmentDurationsMs: number[];
  mapUri: string | null;
  endlist: boolean;
  keyMethod: string | null;
}

export function parseMasterPlaylist(text: string, baseUrl: string): string | null {
  let best: string | null = null;
  let bestBandwidth = -1;
  let pendingBandwidth = 0;
  let awaitingUri = false;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const match = line.match(/BANDWIDTH=(\d+)/);
      pendingBandwidth = match ? Number(match[1]) : 0;
      awaitingUri = true;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (awaitingUri) {
      if (pendingBandwidth >= bestBandwidth) {
        bestBandwidth = pendingBandwidth;
        best = line;
      }
      awaitingUri = false;
      pendingBandwidth = 0;
    }
  }
  if (!best) return null;
  try {
    return new URL(best, baseUrl).toString();
  } catch {
    return null;
  }
}

export function parseMediaPlaylist(text: string, baseUrl: string): HlsMediaPlaylist {
  const segments: string[] = [];
  const segmentDurationsMs: number[] = [];
  let pendingDurationMs = 0;
  let mapUri: string | null = null;
  let endlist = false;
  let keyMethod: string | null = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:\s*([0-9]+(?:\.[0-9]+)?)/);
      const seconds = match ? Number(match[1]) : NaN;
      pendingDurationMs = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
      continue;
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) {
        try {
          mapUri = new URL(match[1], baseUrl).toString();
        } catch {
          mapUri = null;
        }
      }
      continue;
    }
    if (line.startsWith('#EXT-X-ENDLIST')) {
      endlist = true;
      continue;
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      const match = line.match(/METHOD=([^,]+)/);
      keyMethod = match ? match[1].trim() : 'UNKNOWN';
      continue;
    }
    if (line.startsWith('#')) continue;
    try {
      segments.push(new URL(line, baseUrl).toString());
      segmentDurationsMs.push(pendingDurationMs);
    } catch {
      continue;
    } finally {
      pendingDurationMs = 0;
    }
  }
  return { segments, segmentDurationsMs, mapUri, endlist, keyMethod };
}

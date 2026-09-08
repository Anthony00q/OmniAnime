// Constructor puro de filas del Detalle por episodio (Downloader).
// Une activos + pausados (incluidas claves huérfanas del snapshot tras reanudar)
// + cancelados + en cola/completados/fallidos cuando se pasa la lista completa
// de episodios. Sin dependencias de React.
export interface DetailActiveEp {
  episode: number;
  progress: number;
  server?: string;
}

export interface DetailRow {
  episode: number;
  progress: number;
  server?: string;
  state: 'active' | 'paused' | 'cancelled' | 'queued' | 'completed' | 'failed';
}

export interface DetailRowsInput {
  activeEps: DetailActiveEp[];
  pausedEps: unknown;
  cancelledEps: unknown;
  snapshot: unknown;
  completedEps: unknown;
  failedEps: unknown;
  episodes?: unknown;
  itemStatus?: unknown;
}

function intList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n)) : [];
}

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function cleanServer(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function buildDetailRows(input: DetailRowsInput): DetailRow[] {
  const active = (Array.isArray(input.activeEps) ? input.activeEps : []).filter(
    (e): e is DetailActiveEp => !!e && typeof e.episode === 'number',
  );
  const activeSet = new Set(active.map((e) => e.episode));
  const paused = intList(input.pausedEps);
  const cancelled = intList(input.cancelledEps);
  const completed = new Set(intList(input.completedEps));
  const failed = new Set(intList(input.failedEps));
  const hasFullList = Array.isArray(input.episodes);
  const episodesList = intList(input.episodes);
  const itemStatus = typeof input.itemStatus === 'string' ? input.itemStatus : undefined;
  // Huérfano congelado: en pausa/pending se muestra como pausado para no
  // parecer en vuelo; descargando mantiene 'active' hasta el próximo delta.
  const orphanState = itemStatus === 'paused' || itemStatus === 'pending' ? 'paused' : 'active';
  const snapshot =
    input.snapshot && typeof input.snapshot === 'object' && !Array.isArray(input.snapshot)
      ? (input.snapshot as Record<string, unknown>)
      : {};

  const frozenOf = (ep: number): { progress: number; server?: string } => {
    const frozen = snapshot[String(ep)] as { progress?: unknown; server?: unknown } | undefined;
    const entry = frozen && typeof frozen === 'object' && !Array.isArray(frozen) ? frozen : undefined;
    const progress = clamp01(entry?.progress);
    const server = cleanServer(entry?.server);
    return server ? { progress, server } : { progress };
  };

  const rows: DetailRow[] = active.map((e) => ({
    episode: e.episode,
    progress: clamp01(e.progress),
    ...(cleanServer(e.server) ? { server: cleanServer(e.server)! } : {}),
    state: 'active' as const,
  }));

  // Unión pausedEps + claves del snapshot: tras reanudar, pausedEps se limpia
  // pero el snapshot sigue alimentando las filas hasta que lleguen deltas vivos.
  // Huérfana rinde fila congelada (pausada fuera de downloading, activa en vuelo).
  const pausedUnion = new Set<number>(paused);
  const orphans: number[] = [];
  for (const key of Object.keys(snapshot)) {
    if (!/^\d+$/.test(key)) continue;
    const ep = Number(key);
    if (activeSet.has(ep) || completed.has(ep) || failed.has(ep) || cancelled.includes(ep)) continue;
    if (!pausedUnion.has(ep)) orphans.push(ep);
    else pausedUnion.add(ep);
  }
  for (const ep of orphans) {
    const frozen = frozenOf(ep);
    rows.push({
      episode: ep,
      progress: frozen.progress,
      ...(frozen.server ? { server: frozen.server } : {}),
      state: orphanState,
    });
  }
  for (const ep of pausedUnion) {
    if (activeSet.has(ep) || completed.has(ep) || failed.has(ep)) continue;
    if (cancelled.includes(ep)) continue;
    const frozen = frozenOf(ep);
    rows.push({
      episode: ep,
      progress: frozen.progress,
      ...(frozen.server ? { server: frozen.server } : {}),
      state: 'paused' as const,
    });
  }
  // La pausa real nunca duplica: el bucle anterior ya excluye cancelados.
  for (const ep of cancelled) {
    if (activeSet.has(ep) || completed.has(ep) || failed.has(ep)) continue;
    rows.push({ episode: ep, progress: 0, state: 'cancelled' as const });
  }
  if (hasFullList) {
    const accounted = new Set<number>([
      ...activeSet,
      ...pausedUnion,
      ...orphans,
      ...cancelled.filter((ep) => !activeSet.has(ep) && !completed.has(ep) && !failed.has(ep)),
      ...completed,
      ...failed,
    ]);
    for (const ep of completed) {
      if (activeSet.has(ep)) continue;
      const frozen = frozenOf(ep);
      rows.push({
        episode: ep,
        progress: 1,
        ...(frozen.server ? { server: frozen.server } : {}),
        state: 'completed' as const,
      });
    }
    for (const ep of failed) {
      if (activeSet.has(ep)) continue;
      const frozen = frozenOf(ep);
      rows.push({
        episode: ep,
        progress: frozen.progress,
        ...(frozen.server ? { server: frozen.server } : {}),
        state: 'failed' as const,
      });
    }
    // En cola: episodios de la lista sin otro estado. Permite pausar el EP6
    // aunque su worker aún no haya arrancado (parkEpisode lo aparca).
    for (const ep of episodesList) {
      if (accounted.has(ep)) continue;
      accounted.add(ep);
      rows.push({ episode: ep, progress: 0, state: 'queued' as const });
    }
  }
  return rows.sort((a, b) => a.episode - b.episode);
}

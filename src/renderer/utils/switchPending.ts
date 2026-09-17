// Salto manual de servidor: el pending sigue hasta ver progreso del nuevo.
// El anuncio solo no vale, llega con el % anterior y haría flash.
export interface SwitchSnapshot {
  server: string | undefined;
  progress: number | undefined;
}

function cleanServer(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function cleanProgress(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function shouldClearSwitch(input: {
  from: SwitchSnapshot | undefined;
  status: unknown;
  currentServer: unknown;
  currentProgress: unknown;
  activeServers?: unknown;
}): boolean {
  // Sin vuelo no hay salto que mostrar.
  if (input.status !== 'downloading') return true;
  const from = input.from;
  if (!from || from.server === undefined) return false;
  const current = cleanServer(input.currentServer);
  if (!current || current === from.server) return false;
  // Con servidor nuevo, pedir prueba de progreso nuevo.
  if (Array.isArray(input.activeServers) && (input.activeServers as unknown[]).includes(current)) return true;
  const next = cleanProgress(input.currentProgress);
  // Volver a 0 también vale como progreso nuevo.
  if (next !== undefined && from.progress !== undefined && next !== from.progress) return true;
  return false;
}

export function activeServersOf(activeEps: unknown): string[] {
  if (!Array.isArray(activeEps)) return [];
  const out: string[] = [];
  for (const e of activeEps as Array<{ server?: unknown }>) {
    const s = cleanServer(e?.server);
    if (s) out.push(s);
  }
  return out;
}

export function epServerOf(item: unknown, episode: number): string | undefined {
  const entry = item as {
    activeEps?: Array<{ episode?: unknown; server?: unknown }>;
    currentEp?: unknown;
    currentServer?: unknown;
  } | null;
  if (!entry || typeof entry !== 'object') return undefined;
  if (Array.isArray(entry.activeEps)) {
    for (const e of entry.activeEps) {
      if (e?.episode === episode) return cleanServer(e?.server);
    }
  }
  return entry.currentEp === episode ? cleanServer(entry.currentServer) : undefined;
}

export function epProgressOf(item: unknown, episode: number): number | undefined {
  const entry = item as {
    activeEps?: Array<{ episode?: unknown; progress?: unknown }>;
    currentEp?: unknown;
    progress?: unknown;
  } | null;
  if (!entry || typeof entry !== 'object') return undefined;
  if (Array.isArray(entry.activeEps)) {
    for (const e of entry.activeEps) {
      if (e?.episode === episode) return cleanProgress(e?.progress);
    }
  }
  return entry.currentEp === episode ? cleanProgress(entry.progress) : undefined;
}

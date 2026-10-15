export interface HistoryRecord {
  _dbId?: number;
  date: string;
  anime: string;
  slug: string;
  episode: number | string | null;
  status: 'ok' | 'fail' | 'cancelled';
  path: string;
  providerId?: string;
  lang?: 'SUB' | 'DUB';
  scope?: 'episode' | 'queue';
  queueId?: string;
  reason?: string;
  episodeList?: number[];
  dirLabel?: string;
  dirFullPath?: string;
}

export interface GroupedRecord {
  record: HistoryRecord;
  originalIndex: number;
  isPreviousAttempt: boolean;
}

export interface HistoryGroup {
  key: string;
  anime: string;
  slug: string;
  providerId?: string;
  lang?: 'SUB' | 'DUB';
  dirLabel?: string;
  dirFullPath?: string;
  records: GroupedRecord[];
  okCount: number;
  failCount: number;
  cancelledCount: number;
  queueCancellationCount: number;
  totalCount: number;
  requestedCount: number;
  unstartedCount: number;
  lastDate: string;
}

export function groupHistory(history: HistoryRecord[]): HistoryGroup[] {
  const map = new Map<string, HistoryGroup>();

  history.forEach((record, originalIndex) => {
    const key = `${record.providerId || 'unknown'}:${record.slug || record.anime}:${record.dirFullPath || ''}${record.lang === 'DUB' ? ':DUB' : ''}`;
    const existing = map.get(key);

    if (existing) {
      existing.records.push({ record, originalIndex, isPreviousAttempt: false });
    } else {
      map.set(key, {
        key,
        anime: record.anime,
        slug: record.slug,
        providerId: record.providerId,
        lang: record.lang || 'SUB',
        dirLabel: record.dirLabel,
        dirFullPath: record.dirFullPath,
        records: [{ record, originalIndex, isPreviousAttempt: false }],
        okCount: 0,
        failCount: 0,
        cancelledCount: 0,
        queueCancellationCount: 0,
        totalCount: 0,
        requestedCount: 0,
        unstartedCount: 0,
        lastDate: record.date,
      });
    }
  });

  for (const group of map.values()) {
    const latestByEpisode = new Map<number, HistoryRecord>();
    for (const entry of group.records) {
      const { record } = entry;
      if (record.scope === 'queue' || record.episode === null || record.episode === undefined) continue;
      const episode = Number(record.episode);
      if (!Number.isNaN(episode)) {
        entry.isPreviousAttempt = latestByEpisode.has(episode);
        if (!entry.isPreviousAttempt) latestByEpisode.set(episode, record);
      }
    }

    group.okCount = Array.from(latestByEpisode.values()).filter((record) => record.status === 'ok').length;
    group.failCount = Array.from(latestByEpisode.values()).filter((record) => record.status === 'fail').length;
    group.cancelledCount = Array.from(latestByEpisode.values()).filter(
      (record) => record.status === 'cancelled',
    ).length;
    group.queueCancellationCount = group.records.filter(
      (record) => record.record.scope === 'queue' && record.record.status === 'cancelled',
    ).length;
    group.totalCount = latestByEpisode.size;

    const requestedEpisodes = new Set<number>(latestByEpisode.keys());
    for (const { record } of group.records) {
      if (record.scope !== 'queue') continue;
      for (const episode of record.episodeList || []) {
        requestedEpisodes.add(Number(episode));
      }
    }
    group.requestedCount = requestedEpisodes.size;
    group.unstartedCount = Array.from(requestedEpisodes).filter((episode) => !latestByEpisode.has(episode)).length;
  }

  return Array.from(map.values());
}

export function getGroupStatus(group: HistoryGroup) {
  if (group.totalCount === 0) {
    return { label: 'Cancelado', variant: 'cancelled' as const };
  }
  if (group.unstartedCount > 0) return { label: 'Parcial', variant: 'neutral' as const };
  if (group.cancelledCount === group.totalCount && group.failCount === 0) {
    return { label: 'Cancelado', variant: 'cancelled' as const };
  }
  if (group.failCount === 0 && group.cancelledCount === 0) return { label: 'Completado', variant: 'success' as const };
  if (group.okCount === 0 && group.cancelledCount === 0) return { label: 'Fallido', variant: 'danger' as const };
  return { label: 'Parcial', variant: 'neutral' as const };
}

export function formatHistoryReason(record: HistoryRecord): string | null {
  const reason = record.reason?.trim().replace(/\s+/g, ' ');
  if (record.status === 'cancelled') {
    if (reason === 'user') return 'Cancelada por el usuario';
    return reason || 'Cancelada';
  }
  if (record.status === 'fail') return reason || 'Motivo no disponible';
  return reason || null;
}

export function deriveGroupDisplay(group: HistoryGroup) {
  const lastOkPath = group.records.find((r) => r.record.status === 'ok')?.record.path;
  const lastEpisodeRecord = group.records.find((r) => r.record.scope !== 'queue' && !!r.record.path);
  const queueRecord = group.records.find((r) => r.record.scope === 'queue' && !!r.record.path);
  const folderRecord = lastOkPath
    ? group.records.find((r) => r.record.path === lastOkPath)
    : lastEpisodeRecord || queueRecord;
  const folderPath = folderRecord?.record.path;
  const folderIsDirectory = folderRecord?.record.scope === 'queue';
  const showQueueEvent = group.unstartedCount > 0 || group.totalCount === 0;
  const visibleRecords = group.records.filter(({ record }) => record.scope !== 'queue' || showQueueEvent);
  return { folderPath, folderIsDirectory, showQueueEvent, visibleRecords };
}

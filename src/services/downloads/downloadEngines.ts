import * as path from 'path';
import type { DownloadService, FfmpegRuntimeTools } from '../DownloadService';
import { downloadHlsToMp4 } from '../hls/HlsNativeDownloader';
import { MP4UPLOAD_REFERER, resolveMp4UploadDirect } from '../Mp4UploadResolver';
import type { Mp4UploadResolveFn } from '../Mp4UploadResolver';
import { normalizeMp4UploadUrl, providerDownloadReferer, resolveHlsPlaybackUrl } from '../../utils/serverUtils';
import type { DownloadContext, DownloadEngine, DownloadResult, DownloadSource } from './downloadContracts';

// Adaptadores sobre la implementación existente: sin reintentos ni fallback propios.

function handles(serverId: string, source: DownloadSource): boolean {
  return source.canonicalServer === serverId || source.server === serverId;
}

export class MegaDownloadEngine implements DownloadEngine {
  readonly id = 'Mega';

  constructor(private readonly downloadService: DownloadService) {}

  canHandle(source: DownloadSource): boolean {
    return handles('Mega', source);
  }

  async download(source: DownloadSource, ctx: DownloadContext): Promise<DownloadResult> {
    const ok = await this.downloadService.downloadMega(
      source.url,
      ctx.dest,
      (fraction01) => {
        ctx.onProgress({ fraction01 });
      },
      ctx.signal,
      undefined,
      undefined,
      ctx.settings.megaConnections,
    );
    return { ok };
  }
}

export class MediafireDownloadEngine implements DownloadEngine {
  readonly id = 'Mediafire';

  constructor(private readonly downloadService: DownloadService) {}

  canHandle(source: DownloadSource): boolean {
    return handles('Mediafire', source);
  }

  async download(source: DownloadSource, ctx: DownloadContext): Promise<DownloadResult> {
    const ok = await this.downloadService.downloadMediafire(
      source.url,
      ctx.dest,
      (fraction01) => {
        ctx.onProgress({ fraction01 });
      },
      ctx.signal,
      providerDownloadReferer(ctx.item.providerId),
      ctx.settings.mediafireConnections,
    );
    return { ok };
  }
}

// Si el resolve falla no hay descarga directa; el coordinador sigue al siguiente servidor.
export class Mp4UploadDownloadEngine implements DownloadEngine {
  readonly id = 'MP4Upload';

  constructor(
    private readonly downloadService: DownloadService,
    private readonly resolveDirect: Mp4UploadResolveFn = resolveMp4UploadDirect,
  ) {}

  canHandle(source: DownloadSource): boolean {
    return handles('MP4Upload', source);
  }

  async download(source: DownloadSource, ctx: DownloadContext): Promise<DownloadResult> {
    const embedUrl = normalizeMp4UploadUrl(source.url);
    const resolved = await this.resolveDirect(embedUrl).catch(() => ({ ok: false as const }));
    if (!resolved.ok || !resolved.directUrl || ctx.signal.aborted) {
      const reason =
        !resolved.ok && (resolved as { reason?: string }).reason ? ` (${(resolved as { reason: string }).reason})` : '';
      return { ok: false, error: `MP4Upload sin directo útil${reason}.` };
    }
    const ok = await this.downloadService.downloadDirectAxios(
      resolved.directUrl,
      ctx.dest,
      (fraction01) => {
        ctx.onProgress({ fraction01 });
      },
      ctx.signal,
      MP4UPLOAD_REFERER,
      ctx.settings.mp4uploadConnections,
    );
    if (!ok && !ctx.signal.aborted) return { ok: false, error: 'MP4Upload directo falló.' };
    return { ok };
  }
}

export interface HlsEngineDeps {
  getFfmpegTools: () => FfmpegRuntimeTools;
  userAgent: string;
  hlsPlayerReferer: string;
  downloader?: typeof downloadHlsToMp4;
}

export class HlsDownloadEngine implements DownloadEngine {
  readonly id = 'HLS';

  constructor(private readonly deps: HlsEngineDeps) {}

  canHandle(source: DownloadSource): boolean {
    return handles('HLS', source);
  }

  async download(source: DownloadSource, ctx: DownloadContext): Promise<DownloadResult> {
    const downloadUrl = resolveHlsPlaybackUrl(source.url);
    const ffmpegDir = this.deps.getFfmpegTools()?.ffmpegDir;
    const ffmpegPath = ffmpegDir ? path.join(ffmpegDir, 'ffmpeg.exe') : 'ffmpeg.exe';
    const downloader = this.deps.downloader ?? downloadHlsToMp4;
    const result = await downloader(downloadUrl, ctx.dest, {
      userAgent: this.deps.userAgent,
      referer: this.deps.hlsPlayerReferer,
      concurrency: ctx.settings.hlsConnections,
      attempts: Math.max(1, Math.min(3, ctx.settings.retries)),
      ffmpegPath,
      signal: ctx.signal,
      onProgress: (hlsProgress) => {
        ctx.onProgress({ fraction01: hlsProgress.fraction01, phase: hlsProgress.phase });
      },
    });
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error || 'Descarga HLS nativa falló.' };
  }
}

export interface DefaultDownloadEnginesDeps {
  downloadService: DownloadService;
  getFfmpegTools: () => FfmpegRuntimeTools;
  userAgent: string;
  hlsPlayerReferer: string;
  resolveMp4UploadDirect?: Mp4UploadResolveFn;
  hlsDownloader?: typeof downloadHlsToMp4;
}

// Registry con dependencias reales (inyectables para tests).
export function createDefaultDownloadEngines(deps: DefaultDownloadEnginesDeps): DownloadEngine[] {
  return [
    new HlsDownloadEngine({
      getFfmpegTools: deps.getFfmpegTools,
      userAgent: deps.userAgent,
      hlsPlayerReferer: deps.hlsPlayerReferer,
      downloader: deps.hlsDownloader ?? downloadHlsToMp4,
    }),
    new MegaDownloadEngine(deps.downloadService),
    new MediafireDownloadEngine(deps.downloadService),
    new Mp4UploadDownloadEngine(deps.downloadService, deps.resolveMp4UploadDirect ?? resolveMp4UploadDirect),
  ];
}

export function findDownloadEngine(engines: DownloadEngine[], source: DownloadSource): DownloadEngine | undefined {
  return engines.find((engine) => engine.canHandle(source));
}

import { app, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { isPathWithinAnyDirectory } from '../../utils/pathSecurity';
import { SettingsManager } from '../../services/SettingsManager';
import { LibraryAssetService } from '../../services/LibraryAssetService';
import { noopScopedLogger, type ScopedLogger } from '../../services/AppLogger';

export function registerOmniMediaProtocol(options?: { logger?: ScopedLogger }): void {
  const logger = options?.logger ?? noopScopedLogger;
  try {
    protocol.handle('omni-media', async (request) => {
      try {
        const filePath = LibraryAssetService.urlToFilePath(request.url);
        if (!filePath) return new Response('Bad request', { status: 400 });
        let allowedDirs: string[] = [];
        try {
          const s = SettingsManager.get();
          const rawDirs = s.outputDirs || [s.defaultOutputDir];
          allowedDirs = rawDirs
            .map((d) => String(d || '').trim())
            .filter(Boolean)
            .map((d) => path.resolve(d));
        } catch {}
        let userData = '';
        try {
          userData = app.getPath('userData');
        } catch {}
        const assetRoots = userData ? [path.join(userData, 'library_assets_v1')] : [];
        const allAllowed = [...allowedDirs, ...assetRoots].filter(Boolean);
        if (allAllowed.length === 0) return new Response('Forbidden', { status: 403 });
        const isAllowed =
          filePath &&
          (isPathWithinAnyDirectory(filePath, allAllowed, false) ||
            isPathWithinAnyDirectory(path.dirname(filePath), allAllowed, true));
        if (!isAllowed) {
          logger.warn(`omni-media forbidden: ${filePath}`);
          return new Response('Forbidden', { status: 403 });
        }
        const data = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mime =
          ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.avif' ? 'image/avif' : 'image/jpeg';
        return new Response(new Uint8Array(data), {
          headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
  } catch {}
}

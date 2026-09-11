import { app, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { redactLogText } from '../../../services/AppLogger';
import {
  LOG_VIEW_MAX_BYTES_PER_FILE,
  LOG_VIEW_MAX_FILES,
  LOG_VIEW_MAX_TOTAL_BYTES,
  capEntryText,
  collectLogSourcesAsync,
  isKnownLogFile,
  paginateLogEntries,
  removeLogEntries,
  selectLogEntriesFromSources,
} from '../../../utils/logPage';
import type { IpcRegistryDependencies } from '../../IpcRegistry';
import { collectDiagnosticsBundle } from './diagnostics.handlers';

const MAX_DELETE_TARGETS = 1000;
const MAX_TARGET_CHARS = 2500;

function rewriteLogFileSync(file: string, kept: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, kept, 'utf-8');
  fs.renameSync(tmp, file);
}

export function registerLogsHandlers(dependencies: IpcRegistryDependencies): void {
  ipcMain.handle(
    'get-log-page',
    async (
      _,
      filters?: {
        level?: string;
        scope?: string;
        query?: string;
        cursor?: number;
        limit?: number;
        sessionOnly?: boolean;
      },
    ) => {
      try {
        const cursor =
          Number.isInteger(filters?.cursor) && (filters?.cursor as number) >= 0 ? (filters?.cursor as number) : 0;
        const limit = Number.isInteger(filters?.limit) ? (filters?.limit as number) : 100;
        const sessionStart = dependencies.getSessionStart();
        // Async + acotado: no bloquear main con 40 MB sincronos por pagina.
        const sources = await collectLogSourcesAsync(path.dirname(dependencies.getLogPath()), {
          maxFiles: LOG_VIEW_MAX_FILES,
          maxBytesPerFile: LOG_VIEW_MAX_BYTES_PER_FILE,
          maxTotalBytes: LOG_VIEW_MAX_TOTAL_BYTES,
        });
        const entries = selectLogEntriesFromSources(sources, filters ?? {}, sessionStart);
        const { page, nextCursor, total } = paginateLogEntries(entries, cursor, limit);
        const home = app.getPath('home');
        return {
          ok: true as const,
          entries: page.map((e) => ({
            ...e,
            text: redactLogText(capEntryText(e.text), home),
          })),
          nextCursor,
          total,
          sessionStart,
        };
      } catch (error) {
        dependencies.writeGlobalLog(error);
        return { ok: false as const, entries: [], nextCursor: null, total: 0 };
      }
    },
  );

  ipcMain.handle('delete-log-entries', async (_, payload?: { items?: unknown }) => {
    try {
      const rawItems = Array.isArray(payload?.items) ? payload.items : [];
      const logDir = path.dirname(dependencies.getLogPath());
      const byFile = new Map<string, string[]>();
      for (const item of rawItems.slice(0, MAX_DELETE_TARGETS)) {
        if (!item || typeof item !== 'object') continue;
        const { file, text } = item as { file?: unknown; text?: unknown };
        if (typeof file !== 'string' || !isKnownLogFile(file)) continue;
        if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TARGET_CHARS) continue;
        const list = byFile.get(file) || [];
        list.push(text);
        byFile.set(file, list);
      }
      if (byFile.size === 0) return { ok: false as const, deleted: 0, skipped: 0, error: 'Sin entradas válidas' };
      const rules = { now: Date.now(), sessionStart: dependencies.getSessionStart() };
      const home = app.getPath('home');
      const toViewerText = (text: string): string => redactLogText(capEntryText(text), home);
      let deleted = 0;
      let skipped = 0;
      // Síncrono a propósito: ningún append concurrente se pierde durante la reescritura.
      for (const [file, texts] of byFile) {
        const fullPath = path.join(logDir, file);
        let raw = '';
        try {
          raw = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
        } catch {
          continue;
        }
        if (!raw) continue;
        const result = removeLogEntries(raw, texts, rules, toViewerText);
        deleted += result.deleted;
        skipped += result.skipped;
        if (result.deleted > 0) {
          try {
            rewriteLogFileSync(fullPath, result.kept);
          } catch (rewriteError) {
            dependencies.writeGlobalLog(rewriteError);
            return { ok: false as const, deleted, skipped, error: 'No se pudo reescribir el registro' };
          }
        }
      }
      return { ok: true as const, deleted, skipped };
    } catch (error) {
      dependencies.writeGlobalLog(error);
      return { ok: false as const, deleted: 0, skipped: 0, error: 'No se pudieron eliminar las entradas' };
    }
  });

  ipcMain.handle(
    'export-diagnostics',
    async (_, selection?: { level?: unknown; scope?: unknown; query?: unknown; sessionOnly?: unknown }) => {
      try {
        const win = dependencies.getMainWindow();
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const result = await dialog.showSaveDialog(win || (undefined as never), {
          title: 'Exportar diagnóstico',
          defaultPath: path.join(app.getPath('downloads'), `omnianime-diagnostico-${stamp}.log`),
          filters: [{ name: 'Registro', extensions: ['log'] }],
        });
        if (result.canceled || !result.filePath) return { success: false as const, canceled: true };
        if (!result.filePath.toLowerCase().endsWith('.log')) {
          return { success: false as const, error: 'Solo se permite exportar como .log' };
        }
        // Sin filtros se exporta la cola general (comportamiento anterior).
        const { text } = collectDiagnosticsBundle(dependencies, selection ?? {});
        const tmp = `${result.filePath}.tmp`;
        await fs.promises.writeFile(tmp, text, 'utf-8');
        await fs.promises.rename(tmp, result.filePath);
        return { success: true as const, path: result.filePath };
      } catch (error) {
        dependencies.writeGlobalLog(error);
        return { success: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
}

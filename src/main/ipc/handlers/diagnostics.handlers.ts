import { app } from 'electron';
import * as path from 'path';
import { redactLogText } from '../../../services/AppLogger';
import { SettingsManager } from '../../../services/SettingsManager';
import { buildDiagnosticsText } from '../../../utils/diagnostics';
import {
  capEntryText,
  collectLogSources,
  selectLogEntriesFromSources,
  type LogSelection,
} from '../../../utils/logPage';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

const MAX_EXPORT_ENTRIES = 2000;
const MAX_EXPORT_CHARS = 400 * 1024;

function buildFilteredTail(
  logDir: string,
  homeDir: string,
  selection: LogSelection,
  sessionStart: string,
): { text: string; truncated: boolean } {
  const sources = collectLogSources(logDir);
  const entries = selectLogEntriesFromSources(sources, selection, sessionStart).slice(0, MAX_EXPORT_ENTRIES);
  if (entries.length === 0) return { text: '(sin entradas con esos filtros)', truncated: false };
  const lines: string[] = [];
  let chars = 0;
  let truncated = false;
  for (const e of entries) {
    const text = redactLogText(capEntryText(e.text), homeDir);
    if (chars + text.length > MAX_EXPORT_CHARS) {
      truncated = true;
      break;
    }
    lines.push(text);
    chars += text.length;
  }
  if (truncated) lines.push('…[recortado]');
  return { text: lines.join('\n'), truncated };
}

export function collectDiagnosticsBundle(
  dependencies: IpcRegistryDependencies,
  selection: LogSelection,
): { text: string; logPath: string } {
  const settings = SettingsManager.get();
  const snapshot = dependencies.serverStatsStore.getSnapshot();
  const homeDir = app.getPath('home');
  const tail = buildFilteredTail(
    path.dirname(dependencies.getLogPath()),
    homeDir,
    selection,
    dependencies.getSessionStart(),
  );
  const text = buildDiagnosticsText({
    system: {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      userData: app.getPath('userData'),
      outputDirs: settings.outputDirs || [settings.defaultOutputDir],
    },
    serverRows: snapshot.rows,
    totalAttempts: snapshot.totalAttempts,
    logTail: tail.text,
    logTruncated: tail.truncated,
    homeDir,
    maxChars: MAX_EXPORT_CHARS + 32 * 1024,
  });
  return { text, logPath: dependencies.getLogPath() };
}

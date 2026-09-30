import { redactLogText } from './redactLog';

export interface DiagnosticsSystem {
  appVersion: string;
  electronVersion?: string;
  nodeVersion?: string;
  platform?: string;
  arch?: string;
  userData?: string;
  outputDirs?: string[];
}

export interface DiagnosticsServerRow {
  provider: string;
  server: string;
  downloadSuccess?: number;
  allowlisted?: number;
  failures?: Record<string, number>;
}

const MAX_TEXT = 60000;

export function buildDiagnosticsText(input: {
  system: DiagnosticsSystem;
  serverRows: DiagnosticsServerRow[];
  totalAttempts: number;
  logTail: string;
  logTruncated: boolean;
  generatedAt?: string;
  homeDir?: string;
  maxChars?: number;
}): string {
  const { system, serverRows, totalAttempts, logTail, logTruncated, homeDir } = input;
  const redact = (s: string): string => redactLogText(s, homeDir);
  const lines: string[] = [];
  lines.push(`OmniAnime diagnóstico — ${input.generatedAt || new Date().toISOString()}`);
  lines.push(
    `App v${system.appVersion} · Electron ${system.electronVersion || '?'} · Node ${system.nodeVersion || '?'} · ${system.platform || '?'} ${system.arch || ''}`.trim(),
  );
  if (system.userData) lines.push(`userData: ${redact(system.userData)}`);
  if (system.outputDirs && system.outputDirs.length > 0) {
    lines.push(`Carpetas: ${system.outputDirs.map((d) => redact(d)).join(' | ')}`);
  }
  lines.push(`Servidores (${totalAttempts} intentos):`);
  if (serverRows.length === 0) {
    lines.push('- sin datos todavía');
  } else {
    for (const row of serverRows.slice(0, 20)) {
      const ok = row.downloadSuccess ?? 0;
      const base = row.allowlisted ?? 0;
      const fails = row.failures
        ? Object.entries(row.failures)
            .map(([k, v]) => `${k}:${v}`)
            .join(',')
        : '';
      lines.push(`- ${row.provider}/${row.server}: ok ${ok}/${base}${fails ? ` fallos {${fails}}` : ''}`);
    }
  }
  lines.push('Registro (cola del log):');
  lines.push('```');
  lines.push(logTail ? redact(logTail) : '(log vacío)');
  if (logTruncated) lines.push('…[recortado]');
  lines.push('```');
  let text = lines.join('\n');
  const cap = input.maxChars && input.maxChars > 0 ? input.maxChars : MAX_TEXT;
  if (text.length > cap) text = `${text.slice(-cap)}\n…[recortado]`;
  return text;
}

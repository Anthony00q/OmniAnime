import * as fs from 'fs';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { safeErrorMessage } from '../../utils/logging/redactLog';

export type IntegrityResult = { ok: true } | { ok: false; detail: string };

// Sonda en solo lectura: que sea SQLite y que integrity_check no reporte ninguna página dañada.
export function checkDatabaseIntegrity(dbPath: string): IntegrityResult {
  let probe: Database.Database | null = null;
  try {
    probe = new BetterSqlite3(dbPath, { readonly: true });
    const rows = probe.pragma('integrity_check') as Array<Record<string, unknown>>;
    const values = rows.map((row) => String(Object.values(row)[0] ?? ''));
    const ok = values.length > 0 && values.every((value) => value === 'ok');
    return ok ? { ok: true } : { ok: false, detail: values.join('; ') || 'integrity_check sin resultado' };
  } catch (e) {
    return { ok: false, detail: safeErrorMessage(e) };
  } finally {
    try {
      probe?.close();
    } catch {}
  }
}

// El archivo dañado se conserva como respaldo y la ruta queda libre para recrear la DB.
export function quarantineCorruptDatabase(dbPath: string): string | null {
  const quarantinePath = `${dbPath}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(dbPath, quarantinePath);
    return quarantinePath;
  } catch {
    return null;
  }
}

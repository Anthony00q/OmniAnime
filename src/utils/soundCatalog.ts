import { clampTrim, defaultTrimFor } from './soundTrim';

export type SoundCatalogGroup = 'inicio' | 'exito' | 'error' | 'info';

export interface SoundCatalogEntry {
  id: string;
  label: string;
  group: SoundCatalogGroup;
  gainTrim: number;
}

export interface CustomSoundFileMeta {
  id: string;
  name: string;
  ext: string;
  size: number;
  durationSec: number;
  trimStartSec: number;
  trimSec: number;
}

export type ParsedSoundRef = { kind: 'sample'; id: string } | { kind: 'custom'; id: string };

/** Límites de importación. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_DURATION_S = 300;
export const MAX_CUSTOM_SOUND_NAME_LEN = 80;
export const ALLOWED_CUSTOM_SOUND_EXTS = ['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.webm'];

export const SOUND_CATALOG_GROUPS: ReadonlyArray<{ id: SoundCatalogGroup; label: string }> = [
  { id: 'inicio', label: 'Descarga' },
  { id: 'exito', label: 'Éxito' },
  { id: 'error', label: 'Error' },
  { id: 'info', label: 'Info' },
];

const SAMPLE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CUSTOM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeSampleRef(id: string): string {
  return `sample:${id}`;
}

export function makeCustomRef(id: string): string {
  return `custom:${id}`;
}

export function parseSoundRef(ref: unknown): ParsedSoundRef | null {
  if (typeof ref !== 'string') return null;
  const sep = ref.indexOf(':');
  if (sep <= 0) return null;
  const kind = ref.slice(0, sep);
  const id = ref.slice(sep + 1);
  if (kind === 'sample' && SAMPLE_ID_RE.test(id)) return { kind: 'sample', id };
  if (kind === 'custom' && CUSTOM_ID_RE.test(id)) return { kind: 'custom', id };
  return null;
}

export function isAllowedCustomSoundFilename(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name !== basename(name)) return false;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return false;
  const ext = name.slice(dot).toLowerCase();
  return (ALLOWED_CUSTOM_SOUND_EXTS as readonly string[]).includes(ext);
}

export function sanitizeCustomSoundName(raw: string): string {
  let name = basename(String(raw ?? ''));
  name = Array.from(name)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
  name = name.trim();
  if (name.length === 0) return 'Sonido';
  if (name.length > MAX_CUSTOM_SOUND_NAME_LEN) name = name.slice(0, MAX_CUSTOM_SOUND_NAME_LEN).trim();
  return name || 'Sonido';
}

export function validateCustomSoundMeta(meta: { size: number; durationSec: number | null }): {
  ok: boolean;
  error?: string;
} {
  const { size, durationSec } = meta;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'No se pudo leer el tamaño del archivo.' };
  if (size > MAX_IMPORT_BYTES) {
    return { ok: false, error: 'El archivo supera los 10 MB. Usa un audio más ligero.' };
  }
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return { ok: false, error: 'El archivo no es un audio válido.' };
  }
  if (durationSec > MAX_IMPORT_DURATION_S) {
    return { ok: false, error: 'El audio supera los 5 min. Recórtalo antes de subirlo.' };
  }
  return { ok: true };
}

export function sanitizeSoundCustomMap(input: unknown): Partial<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (parseSoundRef(value)) out[key] = String(value);
  }
  return out;
}

export function sanitizeCustomSoundFiles(input: unknown): CustomSoundFileMeta[] {
  if (!Array.isArray(input)) return [];
  const out: CustomSoundFileMeta[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<CustomSoundFileMeta>;
    if (typeof entry.id !== 'string' || !parseSoundRef(makeCustomRef(entry.id))) continue;
    const name = sanitizeCustomSoundName(entry.name ?? '');
    const ext =
      typeof entry.ext === 'string' && ALLOWED_CUSTOM_SOUND_EXTS.includes(entry.ext.toLowerCase())
        ? entry.ext.toLowerCase()
        : '';
    const size = Number(entry.size);
    const durationSec = Number(entry.durationSec);
    if (!ext) continue;
    if (!Number.isFinite(size) || size <= 0 || size > MAX_IMPORT_BYTES) continue;
    if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_IMPORT_DURATION_S) continue;
    const trim =
      entry.trimStartSec == null || entry.trimSec == null
        ? defaultTrimFor(durationSec)
        : clampTrim(Number(entry.trimStartSec), Number(entry.trimSec), durationSec);
    out.push({
      id: entry.id,
      name,
      ext,
      size,
      durationSec,
      trimStartSec: trim.trimStartSec,
      trimSec: trim.trimSec,
    });
  }
  return out;
}

function basename(p: string): string {
  const normalized = String(p ?? '').replace(/\\/g, '/');
  const cut = normalized.lastIndexOf('/');
  return cut >= 0 ? normalized.slice(cut + 1) : normalized;
}

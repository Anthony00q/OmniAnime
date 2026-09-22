import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { isPathSafeForDestructiveOperation } from '../utils/pathSecurity';
import {
  MAX_IMPORT_BYTES,
  isAllowedCustomSoundFilename,
  makeCustomRef,
  parseSoundRef,
  sanitizeCustomSoundName,
  validateCustomSoundMeta,
  type CustomSoundFileMeta,
} from '../utils/soundCatalog';
import { defaultTrimFor } from '../utils/soundTrim';
import { SOUND_CATALOG } from '../utils/soundCatalogData';

export interface CustomSoundServiceOptions {
  userDataDir: string;
  soundsDir?: string;
  statSize?: (filePath: string) => number;
  parseAudioDuration?: (filePath: string) => Promise<number | null>;
}

export type ImportCustomSoundResult = { ok: true; file: CustomSoundFileMeta } | { ok: false; error: string };

const SAMPLE_EXT = '.ogg';

export class CustomSoundService {
  private readonly customDir: string;
  private readonly soundsDir: string;

  constructor(private readonly options: CustomSoundServiceOptions) {
    this.customDir = path.join(options.userDataDir, 'custom_sounds');
    this.soundsDir = options.soundsDir || path.join(process.cwd(), 'assets', 'sounds');
  }

  private ensureCustomDir(): string {
    try {
      if (!fs.existsSync(this.customDir)) fs.mkdirSync(this.customDir, { recursive: true });
    } catch {}
    return this.customDir;
  }

  async importFromPath(srcPath: string): Promise<ImportCustomSoundResult> {
    try {
      const name = sanitizeCustomSoundName(srcPath);
      if (!isAllowedCustomSoundFilename(name)) {
        return { ok: false, error: 'Formato no permitido. Usa mp3, wav, ogg, m4a, aac, flac o webm.' };
      }
      let size: number;
      try {
        size = this.options.statSize ? this.options.statSize(srcPath) : fs.statSync(srcPath).size;
      } catch {
        return { ok: false, error: 'No se pudo leer el archivo.' };
      }
      const durationSec = await this.parseDuration(srcPath);
      const meta = validateCustomSoundMeta({ size, durationSec });
      if (!meta.ok) return { ok: false, error: meta.error || 'Archivo no válido.' };

      const ext = path.extname(name).toLowerCase();
      const id = randomUUID();
      const dest = path.join(this.ensureCustomDir(), `${id}${ext}`);
      fs.copyFileSync(srcPath, dest);
      const trim = defaultTrimFor(durationSec as number);
      return {
        ok: true,
        file: {
          id,
          name,
          ext,
          size,
          durationSec: durationSec as number,
          trimStartSec: trim.trimStartSec,
          trimSec: trim.trimSec,
        },
      };
    } catch {
      return { ok: false, error: 'No se pudo importar el sonido.' };
    }
  }

  async read(ref: string): Promise<Uint8Array | null> {
    const parsed = parseSoundRef(ref);
    if (!parsed) return null;
    if (parsed.kind === 'sample') {
      const known = (SOUND_CATALOG as readonly { id: string }[]).some((s) => s.id === parsed.id);
      if (!known) return null;
      return readBytes(path.join(this.soundsDir, `${parsed.id}${SAMPLE_EXT}`));
    }
    const file = this.findCustomFile(parsed.id);
    return file ? readBytes(file) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!parseSoundRef(makeCustomRef(id))) return false;
    const file = this.findCustomFile(id);
    if (!file) return false;
    if (!isPathSafeForDestructiveOperation(file, [this.ensureCustomDir()], false)) return false;
    try {
      fs.unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }

  async pruneUnreferenced(keepIds: string[]): Promise<number> {
    const keep = new Set(keepIds.filter((id) => parseSoundRef(makeCustomRef(id))));
    let removed = 0;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(this.ensureCustomDir());
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const id = entry.slice(0, entry.lastIndexOf('.'));
      if (!parseSoundRef(makeCustomRef(id))) continue;
      if (keep.has(id)) continue;
      const file = path.join(this.customDir, entry);
      if (!isPathSafeForDestructiveOperation(file, [this.customDir], false)) continue;
      try {
        fs.unlinkSync(file);
        removed += 1;
      } catch {}
    }
    return removed;
  }

  private findCustomFile(id: string): string | null {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(this.ensureCustomDir());
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.startsWith(`${id}.`)) continue;
      const file = path.join(this.customDir, entry);
      try {
        if (fs.statSync(file).isFile() && fs.statSync(file).size > 0 && fs.statSync(file).size <= MAX_IMPORT_BYTES) {
          return file;
        }
      } catch {}
    }
    return null;
  }

  private async parseDuration(filePath: string): Promise<number | null> {
    if (this.options.parseAudioDuration) return this.options.parseAudioDuration(filePath);
    try {
      const { parseBuffer } = await import('music-metadata');
      const bytes = await fs.promises.readFile(filePath);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_BYTES) return null;
      const parsed = await parseBuffer(new Uint8Array(bytes), {}, { duration: true, skipCovers: true });
      const duration = parsed?.format?.duration;
      return typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
    } catch {
      return null;
    }
  }
}

async function readBytes(filePath: string): Promise<Uint8Array | null> {
  try {
    const data = await fs.promises.readFile(filePath);
    return data.byteLength > 0 ? new Uint8Array(data) : null;
  } catch {
    return null;
  }
}

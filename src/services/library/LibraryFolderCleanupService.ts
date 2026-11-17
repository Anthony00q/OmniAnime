import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { isPathSafeForDestructiveOperation } from '../../utils/security/pathSecurity';

const ARTIFACT_NAMES = ['.omnianime', '.poster.jpg', '.poster.png', '.banner.jpg', '.banner.png'];
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
type ArtifactSnapshot = Map<string, string>;
export type FolderCleanupResult = 'removed' | 'preserved' | 'missing';

function fingerprint(stat: fs.Stats, content: Uint8Array): string {
  return [stat.dev, stat.ino, stat.size, createHash('sha256').update(content).digest('hex')].join(':');
}

function currentFingerprint(target: string, stat: fs.Stats): string {
  return stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_ARTIFACT_BYTES
    ? fingerprint(stat, fs.readFileSync(target))
    : 'unknown';
}

export class LibraryFolderCleanupService {
  private readonly owned = new Map<string, ArtifactSnapshot>();

  constructor(private readonly options: { getAllowedBaseDirs: () => string[] }) {}

  async snapshot(folderPath: string): Promise<ArtifactSnapshot> {
    this.validate(folderPath);
    const result: ArtifactSnapshot = new Map();
    for (const name of ARTIFACT_NAMES) {
      try {
        const target = path.join(folderPath, name);
        const stat = await fsp.lstat(target);
        result.set(
          name,
          stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_ARTIFACT_BYTES
            ? fingerprint(stat, await fsp.readFile(target))
            : 'unknown',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return result;
  }

  async record(folderPath: string, before: ArtifactSnapshot): Promise<void> {
    const current = await this.snapshot(folderPath);
    const key = this.key(folderPath);
    const previous = this.owned.get(key);
    const owned: ArtifactSnapshot = new Map();
    for (const [name, revision] of current) {
      if (revision !== 'unknown' && (!before.has(name) || previous?.get(name) === before.get(name))) {
        owned.set(name, revision);
      }
    }
    this.owned.set(key, owned);
    if (this.owned.size > 512) this.owned.delete(this.owned.keys().next().value!);
  }

  forget(folderPath: string): void {
    this.owned.delete(this.key(folderPath));
  }

  async removeIfEmpty(folderPath: string): Promise<FolderCleanupResult> {
    this.validate(folderPath);
    const owned = this.owned.get(this.key(folderPath));
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(folderPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
      throw error;
    }
    // No usar borrado recursivo: una carpeta sin vídeos puede contener archivos personales.
    this.validate(folderPath);
    const current = fs.readdirSync(folderPath, { withFileTypes: true });
    if (entries.length !== current.length) return 'preserved';
    entries = current;
    for (const entry of entries) {
      const target = path.join(folderPath, entry.name);
      if (!isPathSafeForDestructiveOperation(target, this.options.getAllowedBaseDirs(), false)) return 'preserved';
      const stat = fs.lstatSync(target);
      if (entry.name === '.cache' && stat.isDirectory() && !stat.isSymbolicLink()) {
        if (fs.readdirSync(target).length) return 'preserved';
      } else if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        owned?.get(entry.name) !== currentFingerprint(target, stat)
      ) {
        return 'preserved';
      }
    }
    for (const entry of entries) {
      const target = path.join(folderPath, entry.name);
      this.validate(folderPath);
      if (!isPathSafeForDestructiveOperation(target, this.options.getAllowedBaseDirs(), false)) return 'preserved';
      const stat = fs.lstatSync(target);
      if (entry.name === '.cache') {
        if (!stat.isDirectory() || stat.isSymbolicLink()) return 'preserved';
        fs.rmdirSync(target);
      } else {
        if (!stat.isFile() || stat.isSymbolicLink() || owned?.get(entry.name) !== currentFingerprint(target, stat))
          return 'preserved';
        fs.unlinkSync(target);
      }
    }
    try {
      fs.rmdirSync(folderPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOTEMPTY') return 'preserved';
      throw error;
    }
    this.forget(folderPath);
    return 'removed';
  }

  private validate(folderPath: string): void {
    if (
      !path.isAbsolute(folderPath) ||
      !isPathSafeForDestructiveOperation(folderPath, this.options.getAllowedBaseDirs(), false)
    ) {
      throw new Error('La carpeta no es segura para la limpieza.');
    }
  }

  private key(folderPath: string): string {
    const resolved = path.resolve(folderPath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }
}

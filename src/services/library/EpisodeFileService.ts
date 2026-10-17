import * as fsp from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { buildCanonicalEpisodeFileName, extractEpisodeNumberFromVideoFileName } from '../../utils/episodeUtils';
import { errorDetailForLog, safeErrorMessage } from '../../utils/logging/redactLog';
import type { LibraryAssetService } from './LibraryAssetService';

export interface EpisodeFileSettings {
  namingStyle?: 'minimal' | 'descriptive';
}

export interface EpisodeFileServiceOptions {
  getSettings: () => EpisodeFileSettings;
  assetService: LibraryAssetService;
  log: (error: unknown) => void;
  // Pares renombrados por operación para mover sus miniaturas (staging).
  onFilesRenamed?: (pairs: Array<{ from: string; to: string }>) => Promise<void> | void;
}

export interface EpisodeFileRecord {
  name: string;
  path: string;
  ext: string;
  size: string;
  sizeBytes: number;
  episodeNumber: number | null;
}

export interface ReorderFolder {
  name: string;
  path: string;
  episodeCount: number;
  posterLocal: string | null;
}

export type ReorderResult = { success: true; renamed: number } | { success: false; error: string };

export type RenameResult =
  | { success: true; renamed: number; failed: number; skippedConflicts: number; skippedNoNumber: number; total: number }
  | { success: false; error: string };

export interface RenamePreviewItem {
  from: string;
  to: string;
  ext: string;
  episodeNumber: number | null;
  status: 'will_rename' | 'already_correct' | 'conflict' | 'skip_no_number';
}

export interface RenamePreviewResult {
  success: boolean;
  revision?: string;
  error?: string;
  folderName: string;
  style: 'minimal' | 'descriptive';
  items: RenamePreviewItem[];
  summary: {
    total: number;
    toRename: number;
    alreadyCorrect: number;
    conflicts: number;
    skippedNoNumber: number;
  };
}

export interface ReorderPreviewItem {
  from: string;
  to: string;
  ext: string;
  fromEpisodeNumber: number | null;
  toEpisodeNumber: number;
  status: 'will_rename' | 'same';
}

export interface ReorderPreviewResult {
  success: boolean;
  revision?: string;
  error?: string;
  startNumber: number;
  inferredStyle?: 'minimal' | 'descriptive';
  items: ReorderPreviewItem[];
  summary: {
    total: number;
    toRename: number;
    unchanged: number;
  };
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.flv', '.webm']);

// Lecturas en lotes de 16; mutaciones secuenciales.
const READ_BATCH_SIZE = 16;

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class EpisodeFileService {
  constructor(private readonly options: EpisodeFileServiceOptions) {}

  async previewRename(animePath: string, overrideStyle?: 'minimal' | 'descriptive'): Promise<RenamePreviewResult> {
    const fallbackFolderName = (() => {
      try {
        return path.basename(animePath || '');
      } catch {
        return '';
      }
    })();
    if (!animePath || !(await pathExists(animePath))) {
      return {
        success: false,
        error: 'La carpeta no existe.',
        folderName: fallbackFolderName,
        style: (overrideStyle || this.options.getSettings().namingStyle || 'descriptive') as 'minimal' | 'descriptive',
        items: [],
        summary: { total: 0, toRename: 0, alreadyCorrect: 0, conflicts: 0, skippedNoNumber: 0 },
      };
    }
    const allDirents = await fsp.readdir(animePath, { withFileTypes: true });
    const dirents = allDirents.filter(
      (dirent) => dirent.isFile() && VIDEO_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()),
    );

    const sortedDirents = [...dirents].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );

    const folderName = path.basename(animePath);
    const folderLang = (await this.options.assetService.readFolderLibraryMetaAsync(animePath))?.lang;
    const style = (overrideStyle || this.options.getSettings().namingStyle || 'descriptive') as
      'minimal' | 'descriptive';
    const occupiedNames = new Set(allDirents.map((d) => d.name.toLowerCase()));
    const futureNames = new Set<string>();
    const items: RenamePreviewItem[] = [];
    let toRename = 0;
    let alreadyCorrect = 0;
    let conflicts = 0;
    let skippedNoNumber = 0;

    for (const dirent of sortedDirents) {
      const currentName = dirent.name;
      const ext = path.extname(currentName);
      const episodeNumber = extractEpisodeNumberFromVideoFileName(currentName);
      if (episodeNumber === null || !Number.isSafeInteger(episodeNumber) || episodeNumber < 0) {
        skippedNoNumber += 1;
        items.push({
          from: currentName,
          to: currentName,
          ext: ext.replace(/^\./, ''),
          episodeNumber: null,
          status: 'skip_no_number',
        });
        continue;
      }
      const canonicalName = this.buildCanonicalName(
        episodeNumber,
        ext,
        folderName,
        overrideStyle,
        /_DUB\.[^.]+$/i.test(currentName) ? 'DUB' : folderLang,
      );
      if (currentName.toLowerCase() === canonicalName.toLowerCase()) {
        alreadyCorrect += 1;
        futureNames.add(canonicalName.toLowerCase());
        items.push({
          from: currentName,
          to: canonicalName,
          ext: ext.replace(/^\./, ''),
          episodeNumber,
          status: 'already_correct',
        });
        continue;
      }
      const lowerCanonical = canonicalName.toLowerCase();
      const existsElsewhere = occupiedNames.has(lowerCanonical) && lowerCanonical !== currentName.toLowerCase();
      const willCollideFuture = futureNames.has(lowerCanonical);
      if (existsElsewhere || willCollideFuture) {
        conflicts += 1;
        items.push({
          from: currentName,
          to: canonicalName,
          ext: ext.replace(/^\./, ''),
          episodeNumber,
          status: 'conflict',
        });
        futureNames.add(lowerCanonical);
        continue;
      }
      toRename += 1;
      futureNames.add(lowerCanonical);
      items.push({
        from: currentName,
        to: canonicalName,
        ext: ext.replace(/^\./, ''),
        episodeNumber,
        status: 'will_rename',
      });
    }

    items.sort((a, b) => {
      const aNum = a.episodeNumber ?? 9999;
      const bNum = b.episodeNumber ?? 9999;
      if (aNum !== bNum) return aNum - bNum;
      return a.from.localeCompare(b.from, undefined, { numeric: true, sensitivity: 'base' });
    });

    return {
      success: true,
      revision: await this.revisionFor(animePath, items),
      folderName,
      style,
      items,
      summary: {
        total: dirents.length,
        toRename,
        alreadyCorrect,
        conflicts,
        skippedNoNumber,
      },
    };
  }

  async normalizeEpisodeFilesInFolder(
    animePath: string,
    overrideStyle?: 'minimal' | 'descriptive',
    expectedRevision?: string,
  ): Promise<RenameResult | void> {
    if (!(await pathExists(animePath))) return { success: false, error: 'La carpeta no existe.' } as RenameResult;

    const preview = await this.previewRename(animePath, overrideStyle);
    if (!preview.success) return { success: false, error: preview.error || 'No se pudo inspeccionar la carpeta.' };
    if (
      (expectedRevision !== undefined && expectedRevision !== preview.revision) ||
      preview.revision !== (await this.revisionFor(animePath, preview.items))
    ) {
      return { success: false, error: 'El contenido de la carpeta cambió. Revisa la vista previa de nuevo.' };
    }

    const willRename = preview.items.filter((i) => i.status === 'will_rename');
    let renamed = 0;
    let failed = 0;
    let conflicts = preview.summary.conflicts;
    const occupiedNames = new Set(
      (await fsp.readdir(animePath, { withFileTypes: true })).map((d) => d.name.toLowerCase()),
    );

    // Re-validación secuencial antes de cada rename (mismo orden, sin TOCTOU con el preview)
    const renamedPairs: Array<{ from: string; to: string }> = [];
    for (const item of willRename) {
      const expectedCurrent = item.from;
      const canonicalName = item.to;
      const lowerCanonical = canonicalName.toLowerCase();
      const lowerCurrent = expectedCurrent.toLowerCase();
      if (occupiedNames.has(lowerCanonical) && lowerCanonical !== lowerCurrent) {
        conflicts += 1;
        continue;
      }
      const oldPath = path.join(animePath, expectedCurrent);
      const newPath = path.join(animePath, canonicalName);
      try {
        await this.renameWithoutOverwrite(oldPath, newPath);
        occupiedNames.delete(lowerCurrent);
        occupiedNames.add(lowerCanonical);
        renamed += 1;
        renamedPairs.push({ from: oldPath, to: newPath });
      } catch (error) {
        failed++;
        this.options.log(
          `No se pudo renombrar ${path.basename(oldPath)} a ${path.basename(newPath)}: ${errorDetailForLog(error)}`,
        );
      }
    }
    if (renamedPairs.length > 0) {
      try {
        await this.options.onFilesRenamed?.(renamedPairs);
      } catch (error) {
        this.options.log(`No se pudieron mover miniaturas en ${path.basename(animePath)}: ${errorDetailForLog(error)}`);
      }
    }

    const result: RenameResult = {
      success: true,
      renamed,
      failed,
      skippedConflicts: conflicts,
      skippedNoNumber: preview.summary.skippedNoNumber,
      total: preview.summary.total,
    };
    return result;
  }

  async scanEpisodes(animePath: string): Promise<EpisodeFileRecord[]> {
    if (!(await pathExists(animePath))) return [];

    const dirents = (await fsp.readdir(animePath, { withFileTypes: true })).filter(
      (dirent) => dirent.isFile() && VIDEO_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()),
    );

    const files: EpisodeFileRecord[] = [];
    for (let batchStart = 0; batchStart < dirents.length; batchStart += READ_BATCH_SIZE) {
      const chunk = dirents.slice(batchStart, batchStart + READ_BATCH_SIZE);
      const chunkFiles = await Promise.all(
        chunk.map(async (dirent) => {
          const filePath = path.join(animePath, dirent.name);
          let sizeBytes = 0;
          try {
            const stats = await fsp.stat(filePath);
            sizeBytes = stats.size;
          } catch (error) {
            this.options.log(`No se pudo inspeccionar ${path.basename(filePath)}: ${errorDetailForLog(error)}`);
            return null;
          }
          return {
            name: dirent.name,
            path: filePath,
            ext: path.extname(dirent.name).substring(1),
            size: `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
            sizeBytes,
            episodeNumber: extractEpisodeNumberFromVideoFileName(dirent.name),
          };
        }),
      );
      for (const record of chunkFiles) {
        if (record) files.push(record);
      }
    }

    return files.sort((a, b) => {
      const aHasNum = typeof a.episodeNumber === 'number';
      const bHasNum = typeof b.episodeNumber === 'number';
      if (aHasNum && bHasNum && a.episodeNumber !== b.episodeNumber) {
        return (a.episodeNumber as number) - (b.episodeNumber as number);
      }
      if (aHasNum && !bHasNum) return -1;
      if (!aHasNum && bHasNum) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  async getFoldersForReorder(baseDirs: string[]): Promise<ReorderFolder[]> {
    const allFolders: ReorderFolder[] = [];
    const seenPaths = new Set<string>();

    for (const baseDir of baseDirs) {
      if (!baseDir || !(await pathExists(baseDir))) continue;
      const dirents = (await fsp.readdir(baseDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());

      for (let batchStart = 0; batchStart < dirents.length; batchStart += READ_BATCH_SIZE) {
        const chunk = dirents.slice(batchStart, batchStart + READ_BATCH_SIZE);
        const chunkFolders = await Promise.all(
          chunk.map(async (dirent): Promise<ReorderFolder | null> => {
            const folderPath = path.join(baseDir, dirent.name);
            if (seenPaths.has(folderPath)) return null;
            seenPaths.add(folderPath);

            let episodeCount = 0;
            try {
              const entries = await fsp.readdir(folderPath, { withFileTypes: true });
              episodeCount = entries.filter(
                (entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
              ).length;
            } catch (error) {
              this.options.log(
                `No se pudo leer ${path.basename(folderPath)} para reordenar: ${errorDetailForLog(error)}`,
              );
              return null;
            }
            if (episodeCount === 0) return null;
            return {
              name: dirent.name,
              path: folderPath,
              episodeCount,
              posterLocal: await this.options.assetService.getFolderPosterFileUrlAsync(folderPath),
            };
          }),
        );
        for (const folder of chunkFolders) {
          if (folder) allFolders.push(folder);
        }
      }
    }

    allFolders.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    return allFolders;
  }

  async previewReorder(folderPath: string, startNumber: number): Promise<ReorderPreviewResult> {
    if (!folderPath || !(await pathExists(folderPath))) {
      return {
        success: false,
        error: 'La carpeta no existe.',
        startNumber: Number(startNumber) || 0,
        items: [],
        summary: { total: 0, toRename: 0, unchanged: 0 },
      };
    }
    const start = startNumber;
    if (!Number.isSafeInteger(start) || start < 0) {
      return {
        success: false,
        error: 'Número de inicio inválido.',
        startNumber: startNumber,
        items: [],
        summary: { total: 0, toRename: 0, unchanged: 0 },
      };
    }
    const files = (await fsp.readdir(folderPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({
        name: entry.name,
        fullPath: path.join(folderPath, entry.name),
        ext: path.extname(entry.name).toLowerCase(),
        episodeNumber: extractEpisodeNumberFromVideoFileName(entry.name),
      }))
      .sort((a, b) => {
        const aNum = typeof a.episodeNumber === 'number' ? a.episodeNumber : Infinity;
        const bNum = typeof b.episodeNumber === 'number' ? b.episodeNumber : Infinity;
        if (aNum !== bNum) return aNum - bNum;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

    if (files.length === 0) {
      return {
        success: false,
        error: 'No se encontraron archivos de video.',
        startNumber: start,
        items: [],
        summary: { total: 0, toRename: 0, unchanged: 0 },
      };
    }
    if (!Number.isSafeInteger(start + files.length - 1))
      return {
        success: false,
        error: 'La numeración supera el límite permitido.',
        startNumber: start,
        items: [],
        summary: { total: 0, toRename: 0, unchanged: 0 },
      };

    let currentStyle: 'minimal' | 'descriptive' | undefined;
    const firstName = files[0].name;
    if (firstName.startsWith('EP_')) currentStyle = 'minimal';
    else if (firstName.includes(' EP_')) currentStyle = 'descriptive';

    const folderLang = (await this.options.assetService.readFolderLibraryMetaAsync(folderPath))?.lang;
    const items: ReorderPreviewItem[] = files.map((file, idx) => {
      const toNum = start + idx;
      const finalName = this.buildCanonicalName(
        toNum,
        file.ext,
        path.basename(folderPath),
        currentStyle,
        /_DUB\.[^.]+$/i.test(file.name) ? 'DUB' : folderLang,
      );
      return {
        from: file.name,
        to: finalName,
        ext: file.ext.replace(/^\./, ''),
        fromEpisodeNumber: file.episodeNumber,
        toEpisodeNumber: toNum,
        status: file.name === finalName ? 'same' : 'will_rename',
      };
    });

    const toRename = items.filter((i) => i.status === 'will_rename').length;
    return {
      success: true,
      revision: await this.revisionFor(folderPath, items),
      startNumber: start,
      inferredStyle: currentStyle,
      items,
      summary: { total: files.length, toRename, unchanged: items.length - toRename },
    };
  }

  async reorderEpisodes(folderPath: string, startNumber: number, expectedRevision?: string): Promise<ReorderResult> {
    try {
      const preview = await this.previewReorder(folderPath, startNumber);
      if (!preview.success) {
        return { success: false, error: preview.error || 'No se pudo previsualizar el reorden.' };
      }
      if (expectedRevision !== undefined && expectedRevision !== preview.revision) {
        return { success: false, error: 'El contenido de la carpeta cambió. Revisa la vista previa de nuevo.' };
      }
      const files = (await fsp.readdir(folderPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => ({
          name: entry.name,
          fullPath: path.join(folderPath, entry.name),
          ext: path.extname(entry.name).toLowerCase(),
          episodeNumber: extractEpisodeNumberFromVideoFileName(entry.name),
        }))
        .sort((a, b) => {
          const aNum = typeof a.episodeNumber === 'number' ? a.episodeNumber : Infinity;
          const bNum = typeof b.episodeNumber === 'number' ? b.episodeNumber : Infinity;
          if (aNum !== bNum) return aNum - bNum;
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

      if (files.length === 0) return { success: false, error: 'No se encontraron archivos de video.' };
      if (
        files.length !== preview.items.length ||
        files.some((file, index) => file.name !== preview.items[index].from) ||
        preview.revision !== (await this.revisionFor(folderPath, preview.items))
      ) {
        return { success: false, error: 'El contenido de la carpeta cambió. Vuelve a intentarlo.' };
      }
      if (preview.summary.toRename === 0) return { success: true, renamed: 0 };

      // Secuencial a propósito: el rollback restaura en orden inverso exacto.
      const tempNames: Array<{ tempPath: string; ext: string; originalPath: string }> = [];
      for (let i = 0; i < files.length; i += 1) {
        const tempName = `_reorder_tmp_${randomUUID()}_${i}${files[i].ext}`;
        const tempPath = path.join(folderPath, tempName);
        try {
          await this.renameWithoutOverwrite(files[i].fullPath, tempPath);
          tempNames.push({ tempPath, ext: files[i].ext, originalPath: files[i].fullPath });
        } catch (error) {
          for (const temp of tempNames) {
            try {
              await this.renameWithoutOverwrite(temp.tempPath, temp.originalPath);
            } catch (rollbackError) {
              this.options.log(
                `Error revirtiendo ${path.basename(temp.tempPath)}: ${errorDetailForLog(rollbackError)}`,
              );
            }
          }
          this.options.log(error);
          return { success: false, error: `Error al preparar el reordenamiento: ${errorMessage(error)}` };
        }
      }

      const finalNames: string[] = [];
      const appliedRenames: Array<{ finalPath: string; tempPath: string }> = [];
      for (let i = 0; i < tempNames.length; i += 1) {
        const finalName = preview.items[i].to;
        const finalPath = path.join(folderPath, finalName);
        try {
          await this.renameWithoutOverwrite(tempNames[i].tempPath, finalPath);
          finalNames.push(finalName);
          appliedRenames.push({ finalPath, tempPath: tempNames[i].tempPath });
        } catch (error) {
          for (let j = appliedRenames.length - 1; j >= 0; j -= 1) {
            const applied = appliedRenames[j];
            try {
              if (await pathExists(applied.finalPath))
                await this.renameWithoutOverwrite(applied.finalPath, applied.tempPath);
            } catch (rollbackError) {
              this.options.log(
                `Error revirtiendo ${path.basename(applied.finalPath)}: ${errorDetailForLog(rollbackError)}`,
              );
            }
          }
          for (const temp of tempNames) {
            try {
              if (await pathExists(temp.tempPath)) await this.renameWithoutOverwrite(temp.tempPath, temp.originalPath);
            } catch (rollbackError) {
              this.options.log(
                `Error restaurando ${path.basename(temp.tempPath)}: ${errorDetailForLog(rollbackError)}`,
              );
            }
          }
          this.options.log(error);
          return {
            success: false,
            error: `Error al aplicar el nuevo nombre "${finalName}": ${errorMessage(error)}. Se intentó restaurar el estado anterior.`,
          };
        }
      }

      // Miniaturas solo tras éxito total (en fallo el rollback las conserva).
      const thumbPairs: Array<{ from: string; to: string }> = [];
      for (let i = 0; i < tempNames.length && i < finalNames.length; i += 1) {
        const finalPath = path.join(folderPath, finalNames[i]);
        if (tempNames[i].originalPath === finalPath) continue;
        thumbPairs.push({ from: tempNames[i].originalPath, to: finalPath });
      }
      if (thumbPairs.length > 0) {
        try {
          await this.options.onFilesRenamed?.(thumbPairs);
        } catch (error) {
          this.options.log(
            `No se pudieron mover miniaturas en ${path.basename(folderPath)}: ${errorDetailForLog(error)}`,
          );
        }
      }
      return { success: true, renamed: preview.summary.toRename };
    } catch (error) {
      this.options.log(error);
      return { success: false, error: errorMessage(error) };
    }
  }

  private async revisionFor(
    folderPath: string,
    items: Array<{ from: string; to: string; status: string }>,
  ): Promise<string> {
    const facts: unknown[] = [];
    for (let i = 0; i < items.length; i += READ_BATCH_SIZE) {
      facts.push(
        ...(await Promise.all(
          items.slice(i, i + READ_BATCH_SIZE).map(async (item) => {
            const stat = await fsp.lstat(path.join(folderPath, item.from));
            if (!stat.isFile()) throw new Error('El contenido de la carpeta cambió. Revisa la vista previa de nuevo.');
            return [item.from, item.to, item.status, stat.size, stat.mtimeMs, stat.ino];
          }),
        )),
      );
    }
    const names = (await fsp.readdir(folderPath)).sort();
    return createHash('sha256')
      .update(JSON.stringify([facts, names]))
      .digest('hex');
  }

  private async renameWithoutOverwrite(from: string, to: string): Promise<void> {
    try {
      await fsp.lstat(to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await fsp.rename(from, to);
      return;
    }
    throw Object.assign(new Error('El nombre de destino ya está ocupado.'), { code: 'EEXIST' });
  }

  private buildCanonicalName(
    episodeNumber: number,
    ext: string,
    folderName: string,
    overrideStyle?: 'minimal' | 'descriptive',
    lang?: 'SUB' | 'DUB',
  ): string {
    const settings = this.options.getSettings();
    const style = overrideStyle || settings.namingStyle || 'descriptive';
    return buildCanonicalEpisodeFileName(episodeNumber, ext, folderName, style, lang);
  }
}

function errorMessage(error: unknown): string {
  return safeErrorMessage(error) || 'No se pudo completar la operación.';
}

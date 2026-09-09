import * as fsp from 'fs/promises';
import * as path from 'path';
import { buildCanonicalEpisodeFileName, extractEpisodeNumberFromVideoFileName } from '../utils/episodeUtils';
import type { LibraryAssetService } from './LibraryAssetService';

export interface EpisodeFileSettings {
  namingStyle?: 'minimal' | 'descriptive';
  autoRenameRetroactive?: boolean;
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
  | { success: true; renamed: number; skippedConflicts: number; skippedNoNumber: number; total: number }
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
    const dirents = (await fsp.readdir(animePath, { withFileTypes: true })).filter(
      (dirent) => dirent.isFile() && VIDEO_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()),
    );

    const sortedDirents = [...dirents].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );

    const folderName = path.basename(animePath);
    const style = (overrideStyle || this.options.getSettings().namingStyle || 'descriptive') as
      'minimal' | 'descriptive';
    const occupiedNames = new Set(dirents.map((d) => d.name.toLowerCase()));
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
      if (!episodeNumber || episodeNumber <= 0) {
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
      const canonicalName = this.buildCanonicalName(episodeNumber, ext, folderName, overrideStyle);
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
    forceRename = false,
    overrideStyle?: 'minimal' | 'descriptive',
  ): Promise<RenameResult | void> {
    if (!(await pathExists(animePath))) return { success: false, error: 'La carpeta no existe.' } as RenameResult;
    const settings = this.options.getSettings();
    if (!forceRename && settings.autoRenameRetroactive !== true)
      return {
        success: true,
        renamed: 0,
        skippedConflicts: 0,
        skippedNoNumber: 0,
        total: 0,
      } as RenameResult;

    const preview = await this.previewRename(animePath, overrideStyle);
    if (!preview.success) return { success: false, error: preview.error || 'No se pudo inspeccionar la carpeta.' };

    const willRename = preview.items.filter((i) => i.status === 'will_rename');
    let renamed = 0;
    let conflicts = preview.summary.conflicts;
    const occupiedNames = new Set(
      (await fsp.readdir(animePath, { withFileTypes: true }))
        .filter((d) => d.isFile() && VIDEO_EXTENSIONS.has(path.extname(d.name).toLowerCase()))
        .map((d) => d.name.toLowerCase()),
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
        if (!(await pathExists(oldPath))) continue;
        await fsp.rename(oldPath, newPath);
        occupiedNames.delete(lowerCurrent);
        occupiedNames.add(lowerCanonical);
        renamed += 1;
        renamedPairs.push({ from: oldPath, to: newPath });
      } catch (error) {
        this.options.log(`No se pudo renombrar ${oldPath} a ${newPath}: ${error}`);
      }
    }
    if (renamedPairs.length > 0) {
      try {
        await this.options.onFilesRenamed?.(renamedPairs);
      } catch (error) {
        this.options.log(`No se pudieron mover miniaturas en ${animePath}: ${error}`);
      }
    }

    const result: RenameResult = {
      success: true,
      renamed,
      skippedConflicts: conflicts,
      skippedNoNumber: preview.summary.skippedNoNumber,
      total: preview.summary.total,
    };
    return result;
  }

  async scanEpisodes(animePath: string): Promise<EpisodeFileRecord[]> {
    if (!(await pathExists(animePath))) return [];

    await this.normalizeEpisodeFilesInFolder(animePath);
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
            this.options.log(`No se pudo inspeccionar ${filePath}: ${error}`);
            return null;
          }
          return {
            name: dirent.name,
            path: filePath,
            ext: path.extname(dirent.name).substring(1),
            size: `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
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
              this.options.log(`No se pudo leer ${folderPath} para reordenar: ${error}`);
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
    const start = parseInt(String(startNumber), 10);
    if (isNaN(start) || start < 0) {
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

    let currentStyle: 'minimal' | 'descriptive' | undefined;
    const firstName = files[0].name;
    if (firstName.startsWith('EP_')) currentStyle = 'minimal';
    else if (firstName.includes(' EP_')) currentStyle = 'descriptive';

    const items: ReorderPreviewItem[] = files.map((file, idx) => {
      const toNum = start + idx;
      const finalName = this.buildCanonicalName(toNum, file.ext, path.basename(folderPath), currentStyle);
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
      startNumber: start,
      inferredStyle: currentStyle,
      items,
      summary: { total: files.length, toRename, unchanged: items.length - toRename },
    };
  }

  async reorderEpisodes(folderPath: string, startNumber: number): Promise<ReorderResult> {
    try {
      const preview = await this.previewReorder(folderPath, startNumber);
      if (!preview.success) {
        return { success: false, error: preview.error || 'No se pudo previsualizar el reorden.' };
      }
      const start = preview.startNumber;

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

      // Secuencial a propósito: el rollback restaura en orden inverso exacto.
      const tempNames: Array<{ tempPath: string; ext: string; originalPath: string }> = [];
      for (let i = 0; i < files.length; i += 1) {
        const tempName = `_reorder_tmp_${Date.now()}_${i}${files[i].ext}`;
        const tempPath = path.join(folderPath, tempName);
        try {
          await fsp.rename(files[i].fullPath, tempPath);
          tempNames.push({ tempPath, ext: files[i].ext, originalPath: files[i].fullPath });
        } catch (error) {
          for (const temp of tempNames) {
            try {
              await fsp.rename(temp.tempPath, temp.originalPath);
            } catch (rollbackError) {
              this.options.log(`Error revirtiendo ${temp.tempPath}: ${rollbackError}`);
            }
          }
          this.options.log(error);
          return { success: false, error: `Error al preparar el reordenamiento: ${errorMessage(error)}` };
        }
      }

      let currentStyle: 'minimal' | 'descriptive' | undefined;
      const firstName = files[0].name;
      if (firstName.startsWith('EP_')) currentStyle = 'minimal';
      else if (firstName.includes(' EP_')) currentStyle = 'descriptive';

      const finalNames: string[] = [];
      const appliedRenames: Array<{ finalPath: string; tempPath: string }> = [];
      for (let i = 0; i < tempNames.length; i += 1) {
        const finalName = this.buildCanonicalName(start + i, tempNames[i].ext, path.basename(folderPath), currentStyle);
        const finalPath = path.join(folderPath, finalName);
        try {
          await fsp.rename(tempNames[i].tempPath, finalPath);
          finalNames.push(finalName);
          appliedRenames.push({ finalPath, tempPath: tempNames[i].tempPath });
        } catch (error) {
          for (let j = appliedRenames.length - 1; j >= 0; j -= 1) {
            const applied = appliedRenames[j];
            try {
              if (await pathExists(applied.finalPath)) await fsp.rename(applied.finalPath, applied.tempPath);
            } catch (rollbackError) {
              this.options.log(`Error revirtiendo ${applied.finalPath}: ${rollbackError}`);
            }
          }
          for (const temp of tempNames) {
            try {
              if (await pathExists(temp.tempPath)) await fsp.rename(temp.tempPath, temp.originalPath);
            } catch (rollbackError) {
              this.options.log(`Error restaurando ${temp.tempPath}: ${rollbackError}`);
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
          this.options.log(`No se pudieron mover miniaturas en ${folderPath}: ${error}`);
        }
      }
      return { success: true, renamed: finalNames.length };
    } catch (error) {
      this.options.log(error);
      return { success: false, error: errorMessage(error) };
    }
  }

  private buildCanonicalName(
    episodeNumber: number,
    ext: string,
    folderName: string,
    overrideStyle?: 'minimal' | 'descriptive',
  ): string {
    const settings = this.options.getSettings();
    const style = overrideStyle || settings.namingStyle || 'descriptive';
    return buildCanonicalEpisodeFileName(episodeNumber, ext, folderName, style);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

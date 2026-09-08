import * as fs from 'fs';
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

export class EpisodeFileService {
  constructor(private readonly options: EpisodeFileServiceOptions) {}

  previewRename(animePath: string, overrideStyle?: 'minimal' | 'descriptive'): RenamePreviewResult {
    const fallbackFolderName = (() => {
      try {
        return path.basename(animePath || '');
      } catch {
        return '';
      }
    })();
    if (!animePath || !fs.existsSync(animePath)) {
      return {
        success: false,
        error: 'La carpeta no existe.',
        folderName: fallbackFolderName,
        style: (overrideStyle || this.options.getSettings().namingStyle || 'descriptive') as 'minimal' | 'descriptive',
        items: [],
        summary: { total: 0, toRename: 0, alreadyCorrect: 0, conflicts: 0, skippedNoNumber: 0 },
      };
    }
    const dirents = fs
      .readdirSync(animePath, { withFileTypes: true })
      .filter((dirent) => dirent.isFile() && VIDEO_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()));

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

  normalizeEpisodeFilesInFolder(
    animePath: string,
    forceRename = false,
    overrideStyle?: 'minimal' | 'descriptive',
  ): RenameResult | void {
    if (!fs.existsSync(animePath)) return { success: false, error: 'La carpeta no existe.' } as RenameResult;
    const settings = this.options.getSettings();
    if (!forceRename && settings.autoRenameRetroactive !== true)
      return {
        success: true,
        renamed: 0,
        skippedConflicts: 0,
        skippedNoNumber: 0,
        total: 0,
      } as RenameResult;
    if (!fs.existsSync(animePath)) return { success: false, error: 'La carpeta no existe.' } as RenameResult;

    const preview = this.previewRename(animePath, overrideStyle);
    if (!preview.success) return { success: false, error: preview.error || 'No se pudo inspeccionar la carpeta.' };

    const willRename = preview.items.filter((i) => i.status === 'will_rename');
    let renamed = 0;
    let conflicts = preview.summary.conflicts;
    const occupiedNames = new Set(
      fs
        .readdirSync(animePath, { withFileTypes: true })
        .filter((d) => d.isFile() && VIDEO_EXTENSIONS.has(path.extname(d.name).toLowerCase()))
        .map((d) => d.name.toLowerCase()),
    );

    // Re-validate before each rename to avoid TOCTOU with preview
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
        if (!fs.existsSync(oldPath)) continue;
        fs.renameSync(oldPath, newPath);
        occupiedNames.delete(lowerCurrent);
        occupiedNames.add(lowerCanonical);
        renamed += 1;
      } catch (error) {
        this.options.log(`No se pudo renombrar ${oldPath} a ${newPath}: ${error}`);
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

  scanEpisodes(animePath: string): EpisodeFileRecord[] {
    if (!fs.existsSync(animePath)) return [];

    this.normalizeEpisodeFilesInFolder(animePath);
    const files = fs
      .readdirSync(animePath, { withFileTypes: true })
      .filter((dirent) => dirent.isFile() && VIDEO_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()))
      .map((dirent) => {
        const filePath = path.join(animePath, dirent.name);
        const stats = fs.statSync(filePath);
        return {
          name: dirent.name,
          path: filePath,
          ext: path.extname(dirent.name).substring(1),
          size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
          episodeNumber: extractEpisodeNumberFromVideoFileName(dirent.name),
        };
      });

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

  getFoldersForReorder(baseDirs: string[]): ReorderFolder[] {
    const allFolders: ReorderFolder[] = [];
    const seenPaths = new Set<string>();

    for (const baseDir of baseDirs) {
      if (!baseDir || !fs.existsSync(baseDir)) continue;
      const dirents = fs.readdirSync(baseDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

      for (const dirent of dirents) {
        const folderPath = path.join(baseDir, dirent.name);
        if (seenPaths.has(folderPath)) continue;
        seenPaths.add(folderPath);

        let episodeCount = 0;
        try {
          const entries = fs.readdirSync(folderPath, { withFileTypes: true });
          episodeCount = entries.filter(
            (entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
          ).length;
        } catch (error) {
          this.options.log(`No se pudo leer ${folderPath} para reordenar: ${error}`);
          continue;
        }
        if (episodeCount === 0) continue;
        allFolders.push({
          name: dirent.name,
          path: folderPath,
          episodeCount,
          posterLocal: this.options.assetService.getFolderPosterFileUrl(folderPath),
        });
      }
    }

    allFolders.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    return allFolders;
  }

  previewReorder(folderPath: string, startNumber: number): ReorderPreviewResult {
    if (!folderPath || !fs.existsSync(folderPath)) {
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
    const files = fs
      .readdirSync(folderPath, { withFileTypes: true })
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

  reorderEpisodes(folderPath: string, startNumber: number): ReorderResult {
    try {
      const preview = this.previewReorder(folderPath, startNumber);
      if (!preview.success) {
        return { success: false, error: preview.error || 'No se pudo previsualizar el reorden.' };
      }
      const start = preview.startNumber;

      const files = fs
        .readdirSync(folderPath, { withFileTypes: true })
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

      const tempNames: Array<{ tempPath: string; ext: string; originalPath: string }> = [];
      for (let i = 0; i < files.length; i += 1) {
        const tempName = `_reorder_tmp_${Date.now()}_${i}${files[i].ext}`;
        const tempPath = path.join(folderPath, tempName);
        try {
          fs.renameSync(files[i].fullPath, tempPath);
          tempNames.push({ tempPath, ext: files[i].ext, originalPath: files[i].fullPath });
        } catch (error) {
          for (const temp of tempNames) {
            try {
              fs.renameSync(temp.tempPath, temp.originalPath);
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
          fs.renameSync(tempNames[i].tempPath, finalPath);
          finalNames.push(finalName);
          appliedRenames.push({ finalPath, tempPath: tempNames[i].tempPath });
        } catch (error) {
          for (let j = appliedRenames.length - 1; j >= 0; j -= 1) {
            const applied = appliedRenames[j];
            try {
              if (fs.existsSync(applied.finalPath)) fs.renameSync(applied.finalPath, applied.tempPath);
            } catch (rollbackError) {
              this.options.log(`Error revirtiendo ${applied.finalPath}: ${rollbackError}`);
            }
          }
          for (const temp of tempNames) {
            try {
              if (fs.existsSync(temp.tempPath)) fs.renameSync(temp.tempPath, temp.originalPath);
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

export interface FilesRenameItem {
  from: string;
  to: string;
  status: string;
}

export interface FilesRenamePreview {
  success: boolean;
  items?: FilesRenameItem[];
  summary?: {
    total?: number;
    toRename?: number;
    conflicts?: number;
    skippedNoNumber?: number;
  };
  error?: string;
}

export interface FilesRenameRow {
  folderPath: string;
  folderName: string;
  items: FilesRenameItem[];
  toRename: number;
  conflicts: number;
  skipped: number;
  error: string | null;
}

export interface FilesRenameEntry {
  folderPath: string;
  folderName: string;
  preview: FilesRenamePreview | null;
}

// El detalle muestra cambios, conflictos y saltos; lo ya correcto no ensucia.
const DETAIL_STATUSES = new Set(['will_rename', 'conflict', 'skip_no_number']);

export function buildFilesRenameRows(entries: FilesRenameEntry[]): FilesRenameRow[] {
  return entries.map((entry) => {
    const preview = entry.preview;
    if (!preview || !preview.success) {
      return {
        folderPath: entry.folderPath,
        folderName: entry.folderName,
        items: [],
        toRename: 0,
        conflicts: 0,
        skipped: 0,
        error: preview?.error || 'No se pudo inspeccionar la carpeta.',
      };
    }
    const items = (preview.items || []).filter((item) => DETAIL_STATUSES.has(item.status));
    return {
      folderPath: entry.folderPath,
      folderName: entry.folderName,
      items,
      toRename: preview.summary?.toRename ?? items.filter((i) => i.status === 'will_rename').length,
      conflicts: preview.summary?.conflicts ?? items.filter((i) => i.status === 'conflict').length,
      skipped: preview.summary?.skippedNoNumber ?? items.filter((i) => i.status === 'skip_no_number').length,
      error: null,
    };
  });
}

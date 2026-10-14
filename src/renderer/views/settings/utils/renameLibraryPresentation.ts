import type { FilesRenameItem } from '@/renderer/utils/filesRename';

interface RenameLibraryVisualRow {
  path: string;
  name: string;
  metaTitle?: string | null;
  posterLocal?: string | null;
}

export function buildRenameLibraryVisuals(rows: RenameLibraryVisualRow[]) {
  return new Map(
    rows.map((row) => {
      const poster = row.posterLocal?.trim() ?? '';
      return [
        row.path,
        {
          title: row.metaTitle?.trim() || row.name,
          poster: poster.startsWith('omni-media://') ? poster : null,
        },
      ];
    }),
  );
}

export function getRenameExample(items: FilesRenameItem[]): FilesRenameItem | null {
  return items.find((item) => item.status === 'will_rename') ?? null;
}

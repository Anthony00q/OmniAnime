interface RenameLibraryVisualRow {
  path: string;
  name: string;
  metaTitle?: string | null;
  posterLocal?: string | null;
}

export function getRenameLibraryVisual(row: RenameLibraryVisualRow) {
  const poster = row.posterLocal?.trim() ?? '';
  return { title: row.metaTitle?.trim() || row.name, poster: poster.startsWith('omni-media://') ? poster : null };
}

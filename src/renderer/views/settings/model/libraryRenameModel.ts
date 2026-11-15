import type { FilesRenameItem, FilesRenamePreview } from '@/renderer/utils/filesRename';
import { filterLibraryIndex, type LibrarySearchEntry } from '@/renderer/utils/libraryFilter';
import type { FolderRenameEntry } from '@/renderer/utils/folderRename';
import type { LibraryRenameOutcome } from '@/renderer/hooks/queries/libraryRename';

export type RenameMode = 'files' | 'folders';
export type RenameFilter = 'all' | 'changes' | 'issues' | 'unchanged' | 'completed' | 'not-included';
export type RenameStep = 'prepare' | 'review' | 'result';
export type RenameEntryState = 'pending' | 'ready' | 'error' | LibraryRenameOutcome['state'];

export interface LibraryRenameEntry {
  path: string;
  name: string;
  sourceDir: string;
  metaTitle?: string | null;
  posterLocal?: string | null;
  providerId?: string | null;
  metaSlug?: string | null;
  alternativeTitles?: string[];
  lang?: 'SUB' | 'DUB';
  meta?: FolderRenameEntry['meta'];
  state: RenameEntryState;
  changes: number;
  conflicts: number;
  skipped: number;
  items: FilesRenameItem[];
  preview?: FilesRenamePreview;
  newName?: string;
  error?: string;
  result?: LibraryRenameOutcome;
}

export function canIncludeRename(row: LibraryRenameEntry): boolean {
  return row.state === 'ready' && row.changes > 0;
}

export function hasRenameIssue(row: LibraryRenameEntry): boolean {
  return (
    ['error', 'failed', 'partial', 'uncertain', 'not-started'].includes(row.state) ||
    row.conflicts > 0 ||
    row.skipped > 0
  );
}

export function getRenameCounts(rows: readonly LibraryRenameEntry[], selected: ReadonlySet<string>) {
  return rows.reduce(
    (counts, row) => {
      if (canIncludeRename(row)) {
        counts.changes++;
        if (selected.has(row.path)) {
          counts.selected++;
          counts.files += row.changes;
        }
      }
      if (hasRenameIssue(row)) counts.issues++;
      if (row.state === 'pending') counts.pending++;
      if (row.state === 'ready' && row.changes === 0 && !hasRenameIssue(row)) counts.unchanged++;
      return counts;
    },
    { selected: 0, files: 0, changes: 0, issues: 0, unchanged: 0, pending: 0 },
  );
}

export function filterRenameEntries(
  index: readonly LibrarySearchEntry<LibraryRenameEntry>[],
  directory: string,
  query: string,
  filter: RenameFilter,
): LibraryRenameEntry[] {
  return filterLibraryIndex(index, directory, query).filter((row) => {
    if (filter === 'changes') return canIncludeRename(row);
    if (filter === 'issues') return hasRenameIssue(row);
    if (filter === 'unchanged') return row.state === 'ready' && row.changes === 0 && !hasRenameIssue(row);
    if (filter === 'completed') return row.state === 'done';
    if (filter === 'not-included') return row.state === 'ready' && !row.result && !hasRenameIssue(row);
    return true;
  });
}

export function presentRenameOutcome(result: LibraryRenameOutcome): { title: string; details: string[] } {
  const renamed = result.renamed ?? 0;
  const title =
    result.state === 'uncertain'
      ? 'Resultado sin confirmar'
      : result.state === 'not-started'
        ? 'No iniciado'
        : result.state === 'failed'
          ? 'No se pudo completar el renombrado'
          : result.kind === 'folders'
            ? 'Carpeta renombrada'
            : renamed === 0
              ? 'No se renombraron archivos'
              : `${renamed} ${renamed === 1 ? 'archivo renombrado' : 'archivos renombrados'}`;
  const details: string[] = [];
  if (result.error) details.push(result.error);
  if (result.failed)
    details.push(
      `${result.failed} ${result.failed === 1 ? 'archivo no se pudo renombrar' : 'archivos no se pudieron renombrar'}`,
    );
  if (result.conflicts)
    details.push(`${result.conflicts} ${result.conflicts === 1 ? 'archivo en conflicto' : 'archivos en conflicto'}`);
  if (result.skipped)
    details.push(`${result.skipped} ${result.skipped === 1 ? 'archivo sin número' : 'archivos sin número'}`);
  return { title, details };
}

export function getRenameResultCounts(rows: readonly LibraryRenameEntry[]) {
  return rows.reduce(
    (counts, row) => {
      counts.renamed += row.result?.renamed ?? 0;
      if (row.result && row.result.state !== 'not-started') counts.processed++;
      if (row.state === 'done') counts.completed++;
      if (hasRenameIssue(row)) counts.issues++;
      else if (row.state === 'ready' && !row.result) counts.notIncluded++;
      return counts;
    },
    { renamed: 0, processed: 0, completed: 0, issues: 0, notIncluded: 0 },
  );
}

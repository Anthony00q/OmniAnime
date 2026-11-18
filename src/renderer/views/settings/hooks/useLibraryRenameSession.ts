import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryFolder } from '@/services/library/LibraryFileService';
import { useLibrary, useLibraryRenameOperations, type LibraryRenameCommand } from '@/renderer/hooks/useQueries';
import {
  anilistInputFromFolderMeta,
  computeFolderRenamePlan,
  type FolderRenameEntry,
} from '@/renderer/utils/folderRename';
import { buildLibrarySearchIndex } from '@/renderer/utils/libraryFilter';
import {
  isValidFolderName,
  resolveFolderName,
  type AniListFolderTitles,
  type FolderNameSource,
} from '@/utils/downloads/folderNaming';
import {
  canIncludeRename,
  filterRenameEntries,
  getRenameCounts,
  getRenameResultCounts,
  type LibraryRenameEntry,
  type RenameFilter,
  type RenameMode,
  type RenameStep,
} from '@/renderer/views/settings/model/libraryRenameModel';

function toEntry(row: LibraryFolder): LibraryRenameEntry {
  return {
    ...row,
    state: 'pending',
    changes: 0,
    conflicts: 0,
    skipped: 0,
    items: [],
    meta: {
      providerId: row.providerId,
      slug: row.metaSlug,
      title: row.metaTitle,
      secondaryTitle: row.secondaryTitle,
      alternativeTitles: row.alternativeTitles,
      year: row.year,
      category: row.category,
      season: row.season,
      lang: row.lang,
    },
  };
}

export function useLibraryRenameSession(
  dirs: string[],
  mode: RenameMode,
  initialStyle: 'minimal' | 'descriptive',
  initialSource: FolderNameSource,
) {
  const library = useLibrary(dirs);
  const operations = useLibraryRenameOperations();
  const [step, setStep] = useState<RenameStep>('prepare');
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [reviewedRows, setReviewedRows] = useState<LibraryRenameEntry[]>([]);
  const [style, setStyle] = useState(initialStyle);
  const [source, setSource] = useState(initialSource);
  const [missingTitlePolicy, setMissingTitlePolicy] = useState<'fallback' | 'skip'>('fallback');
  const [directory, setDirectory] = useState('all');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RenameFilter>('all');
  const [entries, setEntries] = useState<LibraryRenameEntry[]>([]);
  const [snapshot, setSnapshot] = useState<LibraryRenameEntry[]>([]);
  const [titles, setTitles] = useState<Record<string, AniListFolderTitles | null>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [customPaths, setCustomPaths] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activePath, setActivePath] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const dirsKey = JSON.stringify(dirs);
  useEffect(() => {
    generation.current++;
    setStep('prepare');
    setEntries([]);
    setReviewKey(null);
    setHasResult(false);
    setReviewedRows([]);
    setInspecting(false);
    setDirectory('all');
  }, [dirsKey]);

  const draftKey = JSON.stringify([dirsKey, mode, style, source, directory, missingTitlePolicy]);
  const hasPreview = reviewKey === draftKey && !inspecting;
  const plannedRows = useMemo(() => {
    if (mode === 'files') return entries;
    const folderEntries: FolderRenameEntry[] = snapshot.map((entry) => ({
      folderPath: entry.path,
      folderName: entry.name,
      meta: entry.meta ?? null,
    }));
    const excluded = new Set(snapshot.map((entry) => entry.path));
    const sources = new Map(
      entries
        .filter((entry) => entry.state === 'ready')
        .map((entry) => {
          const resolution = resolveFolderName(
            {
              providerTitle: entry.meta?.title,
              providerAlternativeTitles: entry.meta?.alternativeTitles,
              japaneseTitle: entry.meta?.secondaryTitle,
              anilist: titles[entry.path],
            },
            source,
          );
          const automatic = overrides[entry.path] === undefined;
          const usesFallback = automatic && resolution.key !== null && resolution.key !== source;
          const skip = automatic && (resolution.key === null || (usesFallback && missingTitlePolicy === 'skip'));
          if (!skip) excluded.delete(entry.path);
          return [entry.path, { usesFallback, skip }] as const;
        }),
    );
    const plan = new Map(
      computeFolderRenamePlan(folderEntries, source, titles, overrides, excluded).map((item) => [
        item.folderPath,
        item,
      ]),
    );
    return entries.map((entry) => {
      const resolution = sources.get(entry.path);
      if (!resolution) return entry;
      const { skip, usesFallback } = resolution;
      const item = plan.get(entry.path);
      const custom = overrides[entry.path];
      const invalid = custom !== undefined && !isValidFolderName(custom);
      return {
        ...entry,
        newName: item?.newName,
        usesFallback,
        omitted: skip,
        notice: skip ? 'El título elegido no está disponible. Esta carpeta no se incluye.' : undefined,
        changes: !skip && !invalid && item?.status === 'will_rename' ? 1 : 0,
        conflicts: invalid || item?.status === 'conflict' ? 1 : 0,
        error: invalid
          ? 'El nombre no es válido en Windows.'
          : item?.status === 'conflict'
            ? 'No hay un nombre de destino disponible.'
            : undefined,
      };
    });
  }, [mode, entries, snapshot, source, titles, overrides, missingTitlePolicy]);
  const rows = step === 'review' && hasResult ? reviewedRows : plannedRows;
  const resultCounts = useMemo(() => getRenameResultCounts(plannedRows), [plannedRows]);
  const index = useMemo(() => buildLibrarySearchIndex(rows), [rows]);
  const visible = useMemo(() => filterRenameEntries(index, 'all', query, filter), [index, query, filter]);
  const active = visible.find((row) => row.path === activePath) ?? visible[0] ?? null;
  const counts = useMemo(() => getRenameCounts(rows, selected), [rows, selected]);

  const inspect = async (
    entry: LibraryRenameEntry,
    force = false,
  ): Promise<{ entry: LibraryRenameEntry; titles?: AniListFolderTitles | null }> => {
    try {
      if (mode === 'files') {
        const preview = await operations.inspectFiles(entry.path, style);
        if (!preview?.success || !preview.revision) throw new Error('No se pudo inspeccionar la carpeta.');
        return {
          entry: {
            ...entry,
            state: 'ready',
            preview,
            items: preview.items ?? [],
            changes: preview.summary?.toRename ?? 0,
            conflicts: preview.summary?.conflicts ?? 0,
            skipped: preview.summary?.skippedNoNumber ?? 0,
            error: undefined,
            result: undefined,
          },
        };
      }
      const folderPreview = await operations.inspectFolder(entry.path, entry.name);
      const meta = folderPreview.meta;
      const inspectedEntry = {
        ...entry,
        meta,
        metaTitle: meta?.title ?? null,
        metaSlug: meta?.slug ?? null,
        providerId: meta?.providerId ?? null,
        alternativeTitles: meta?.alternativeTitles ?? [],
        lang: meta?.lang ?? 'SUB',
        folderRevision: folderPreview.revision,
      };
      if (source.startsWith('anilist') || force) {
        let resolved;
        try {
          resolved = await operations.resolveTitles(anilistInputFromFolderMeta(meta), force);
        } catch {
          const message = 'No se pudieron consultar los títulos de AniList.';
          return {
            entry: source.startsWith('anilist')
              ? { ...inspectedEntry, state: 'error', changes: 0, error: `${message} Puedes reintentar.` }
              : { ...inspectedEntry, state: 'ready', result: undefined, error: undefined, titlesNotice: message },
            titles: null,
          };
        }
        return {
          entry: { ...inspectedEntry, state: 'ready', result: undefined, error: undefined, titlesNotice: undefined },
          titles: resolved?.titles ?? null,
        };
      }
      return { entry: { ...inspectedEntry, state: 'ready', result: undefined, error: undefined } };
    } catch {
      return {
        entry: {
          ...entry,
          state: 'error',
          changes: 0,
          error: 'No se pudo inspeccionar la carpeta. Puedes volver a intentarlo.',
        },
      };
    }
  };

  const prepare = async () => {
    if (running.current || operations.isMutating || inspecting) return;
    if (hasPreview) {
      setFilter('all');
      setStep('review');
      return;
    }
    if (!library.data || library.isError) return;
    const current = ++generation.current;
    const all = (library.data as LibraryFolder[]).map(toEntry);
    const scope = all.filter((row) => directory === 'all' || row.sourceDir === directory);
    setSnapshot(all);
    setEntries(scope);
    setSelected(new Set());
    setTitles({});
    setOverrides({});
    setCustomPaths(new Set());
    setQuery('');
    setFilter('all');
    setError(null);
    setReviewKey(draftKey);
    setHasResult(false);
    setReviewedRows([]);
    setActivePath(scope[0]?.path ?? null);
    setStep('review');
    setInspecting(true);
    setProgress({ done: 0, total: scope.length });
    const completed: LibraryRenameEntry[] = [];
    const pending = new Map<string, LibraryRenameEntry>();
    const resolvedTitles: Record<string, AniListFolderTitles | null> = {};
    for (const entry of scope) {
      if (current !== generation.current) return;
      const inspected = await inspect(entry);
      if (current !== generation.current) return;
      const next = inspected.entry;
      if ('titles' in inspected) resolvedTitles[entry.path] = inspected.titles ?? null;
      completed.push(next);
      pending.set(entry.path, next);
      if (completed.length === 1 || completed.length % 16 === 0 || completed.length === scope.length) {
        const updates = new Map(pending);
        pending.clear();
        setEntries((previous) => previous.map((row) => updates.get(row.path) ?? row));
        setSnapshot((previous) => previous.map((row) => updates.get(row.path) ?? row));
        setTitles({ ...resolvedTitles });
        setProgress({ done: completed.length, total: scope.length });
      }
    }
    setSelected(new Set(completed.filter((row) => row.state === 'ready').map((row) => row.path)));
    setInspecting(false);
  };

  const retryInspection = async (entry: LibraryRenameEntry) => {
    if (inspecting || running.current || operations.isMutating || hasResult) return;
    const current = generation.current;
    setInspecting(true);
    setProgress({ done: 0, total: 1 });
    const inspected = await inspect(entry, true);
    if (current !== generation.current) return;
    const next = inspected.entry;
    if ('titles' in inspected) setTitles((previous) => ({ ...previous, [entry.path]: inspected.titles ?? null }));
    setEntries((previous) => previous.map((row) => (row.path === entry.path ? next : row)));
    setSnapshot((previous) => previous.map((row) => (row.path === entry.path ? next : row)));
    if (next.state === 'ready' && entry.state === 'error') setSelected((previous) => new Set(previous).add(entry.path));
    setProgress({ done: 1, total: 1 });
    setInspecting(false);
  };

  const apply = async () => {
    if (
      running.current ||
      inspecting ||
      operations.isMutating ||
      counts.selected === 0 ||
      hasResult ||
      !hasPreview ||
      step !== 'review'
    )
      return;
    const commands: LibraryRenameCommand[] = rows
      .filter((row) => selected.has(row.path) && canIncludeRename(row))
      .map((row) =>
        mode === 'files'
          ? { kind: 'files', path: row.path, style, revision: row.preview!.revision! }
          : { kind: 'folders', path: row.path, newName: row.newName!, revision: row.folderRevision },
      );
    const current = generation.current;
    running.current = true;
    setProgress({ done: 0, total: commands.length });
    setError(null);
    const namesByPath = new Map(rows.map((row) => [row.path, row.newName]));
    setReviewedRows(rows);
    try {
      await operations.batch.mutateAsync({
        commands,
        onProgress: (outcome, done) => {
          if (current !== generation.current) return;
          setEntries((previous) =>
            previous.map((row) =>
              row.path === outcome.path
                ? {
                    ...row,
                    newName: outcome.finalName ?? namesByPath.get(row.path),
                    state: outcome.state,
                    result: outcome,
                  }
                : row,
            ),
          );
          setProgress({ done, total: commands.length });
        },
      });
    } catch {
      if (current === generation.current)
        setError('No se pudo completar la operación. Revisa la librería antes de volver a intentarlo.');
    } finally {
      running.current = false;
      if (current === generation.current) {
        setHasResult(true);
        setFilter('all');
        setStep('result');
      }
    }
  };

  const toggle = useCallback(
    (path: string, included: boolean) => {
      if (inspecting || operations.isMutating || step !== 'review' || hasResult) return;
      setSelected((previous) => {
        const next = new Set(previous);
        if (included) next.add(path);
        else next.delete(path);
        return next;
      });
    },
    [inspecting, operations.isMutating, step, hasResult],
  );
  const selectVisible = (included: boolean) => {
    if (inspecting || operations.isMutating || step !== 'review' || hasResult) return;
    setSelected((previous) => {
      const next = new Set(previous);
      for (const row of visible)
        if (canIncludeRename(row)) {
          if (included) next.add(row.path);
          else next.delete(row.path);
        }
      return next;
    });
  };

  const invalidateReview = () => {
    generation.current++;
    setReviewKey(null);
    setHasResult(false);
    setReviewedRows([]);
    setEntries([]);
    setSelected(new Set());
    setInspecting(false);
    setFilter('all');
    setError(null);
  };
  const navigate = (target: RenameStep) => {
    if (running.current || operations.isMutating || target === step) return;
    if (target === 'review' && !hasPreview) return;
    if (target === 'result' && (!hasResult || !hasPreview)) return;
    if (inspecting) {
      generation.current++;
      setReviewKey(null);
      setInspecting(false);
    }
    setFilter('all');
    setStep(target);
  };

  return {
    library,
    step,
    style,
    setStyle: (value: 'minimal' | 'descriptive') => {
      if (value !== style) {
        invalidateReview();
        setStyle(value);
      }
    },
    source,
    missingTitlePolicy,
    setMissingTitlePolicy: (value: 'fallback' | 'skip') => {
      if (value !== missingTitlePolicy) {
        invalidateReview();
        setMissingTitlePolicy(value);
      }
    },
    setSource: (value: FolderNameSource) => {
      if (value !== source) {
        invalidateReview();
        setSource(value);
      }
    },
    directory,
    setDirectory: (value: string) => {
      if (value !== directory) {
        invalidateReview();
        setDirectory(value);
      }
    },
    query,
    setQuery,
    filter,
    setFilter,
    rows,
    visible,
    active,
    setActivePath,
    titles,
    overrides,
    customPaths,
    setOverride: (path: string, value: string | null, custom = false) => {
      setCustomPaths((previous) => {
        const next = new Set(previous);
        if (custom) next.add(path);
        else next.delete(path);
        return next;
      });
      setOverrides((previous) => {
        const next = { ...previous };
        if (value === null) delete next[path];
        else next[path] = value;
        return next;
      });
    },
    selected,
    counts,
    resultCounts,
    hasPreview,
    hasResult,
    navigate,
    startNewReview: () => {
      if (running.current || operations.isMutating) return;
      invalidateReview();
      setStep('prepare');
    },
    inspecting,
    progress,
    error,
    busy: operations.batch.isPending,
    blocked: operations.isMutating,
    prepare,
    retryInspection,
    apply,
    toggle,
    selectVisible,
  };
}

export type LibraryRenameSession = ReturnType<typeof useLibraryRenameSession>;

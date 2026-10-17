import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isIpcFailError, unwrap } from '@/renderer/hooks/queries/unwrap';
import { Dialog } from '@/renderer/components/Dialog';
import { CustomCheckbox } from '@/renderer/components/CustomCheckbox';
import { ANILIST_BANNER_STALE_MS, getAniListBannerQuery, useLibrary } from '@/renderer/hooks/useQueries';
import { computeFolderRenamePlan, anilistInputFromFolderMeta } from '@/renderer/utils/folderRename';
import { FOLDER_NAME_SOURCE_OPTIONS } from '@/renderer/views/settings/constants';
import type { AniListFolderTitles, FolderNameSource } from '@/utils/downloads/folderNaming';
import { buildRenameLibraryVisuals } from '@/renderer/views/settings/utils/renameLibraryPresentation';
import { RenameLibraryComparison, RenameLibraryPoster } from './RenameLibraryPreview';

interface FolderRow {
  name: string;
  path: string;
  metaTitle?: string | null;
  secondaryTitle?: string | null;
  alternativeTitles?: string[];
  year?: string | null;
  category?: string | null;
  season?: string | null;
  lang?: 'SUB' | 'DUB';
}

interface RenameFoldersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirs: string[];
  source: FolderNameSource;
}

function sourceLabel(source: FolderNameSource): string {
  return FOLDER_NAME_SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;
}

export function RenameFoldersDialog({ open, onOpenChange, dirs, source }: RenameFoldersDialogProps) {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useLibrary(dirs);
  const visuals = useMemo(() => buildRenameLibraryVisuals(rows), [rows]);
  const [titlesByPath, setTitlesByPath] = useState<Record<string, AniListFolderTitles | null>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const selectionInitialized = useRef(false);

  const entries = useMemo(() => {
    const list = (rows as FolderRow[]) || [];
    return list.map((row) => ({
      folderPath: row.path,
      folderName: row.name,
      meta: {
        title: row.metaTitle ?? null,
        secondaryTitle: row.secondaryTitle ?? null,
        alternativeTitles: row.alternativeTitles ?? null,
        year: row.year ?? null,
        category: row.category ?? null,
        season: row.season ?? null,
        lang: row.lang,
      },
    }));
  }, [rows]);

  const plan = useMemo(() => computeFolderRenamePlan(entries, source, titlesByPath), [entries, source, titlesByPath]);
  const renamable = plan.filter((item) => item.status === 'will_rename');
  const unchangedCount = plan.length - renamable.length - plan.filter((item) => item.status === 'conflict').length;
  const needsAniList = source.startsWith('anilist');
  const resolving = needsAniList && progress.total > 0 && progress.done < progress.total;

  useEffect(() => {
    if (!selectionInitialized.current && renamable.length > 0) {
      selectionInitialized.current = true;
      setSelected(new Set(renamable.map((item) => item.folderPath)));
    }
  }, [renamable]);

  useEffect(() => {
    if (!open || !needsAniList || entries.length === 0) return;
    let cancelled = false;
    setProgress({ done: 0, total: entries.length });
    (async () => {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (cancelled) return;
        let titles: AniListFolderTitles | null = null;
        try {
          const meta = await queryClient.fetchQuery({
            ...getAniListBannerQuery(anilistInputFromFolderMeta(entry.meta)),
            staleTime: ANILIST_BANNER_STALE_MS,
          });
          titles = meta?.titles ?? null;
        } catch {
          titles = null;
        }
        if (cancelled) return;
        setTitlesByPath((prev) => ({ ...prev, [entry.folderPath]: titles }));
        setProgress({ done: i + 1, total: entries.length });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, needsAniList, entries, queryClient]);

  const toggle = (folderPath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const pendingCount = renamable.filter((item) => selected.has(item.folderPath) && !results[item.folderPath]).length;

  const handleConfirm = async () => {
    setRenaming(true);
    const nextResults: Record<string, { ok: boolean; error?: string }> = { ...results };
    for (const item of renamable) {
      if (!selected.has(item.folderPath) || nextResults[item.folderPath]) continue;
      try {
        unwrap(
          await window.api.invoke('rename-folder', {
            oldPath: item.folderPath,
            newName: item.newName,
          }),
          { toast: false },
        );
        nextResults[item.folderPath] = { ok: true };
      } catch (e: unknown) {
        nextResults[item.folderPath] = {
          ok: false,
          error: isIpcFailError(e) ? e.message : 'No se pudo renombrar.',
        };
      }
    }
    setResults(nextResults);
    setRenaming(false);
    const attempted = Object.values(nextResults);
    const okCount = attempted.filter((r) => r.ok).length;
    const failCount = attempted.length - okCount;
    queryClient.invalidateQueries({ queryKey: ['library'] });
    queryClient.invalidateQueries({ queryKey: ['episodes'] });
    if (failCount === 0) {
      toast.success(okCount === 1 ? '1 carpeta renombrada' : `${okCount} carpetas renombradas`);
      onOpenChange(false);
    } else {
      toast.error(`Renombradas ${okCount}. ${failCount} sin renombrar; revisa la lista.`);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Renombrar carpetas de la librería"
      message={`Se aplicará «${sourceLabel(source)}» a las carpetas ya descargadas.`}
      confirmLabel={renaming ? 'Renombrando…' : `Renombrar (${pendingCount})`}
      confirmDisabled={pendingCount === 0 || renaming || resolving}
      confirmLoading={renaming}
      closeOnConfirm={false}
      dismissDisabled={renaming}
      onConfirm={handleConfirm}
      className="max-w-2xl"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Las carpetas con una descarga activa no se tocan. Si un nombre ya está en uso, se le añade el año.
        </p>
        <div className="flex items-center gap-2 text-[13px] text-text-tertiary tabular-nums">
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Leyendo la librería…
            </span>
          ) : resolving ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Vinculando con AniList… {progress.done}/{progress.total}
            </span>
          ) : (
            <span>
              {renamable.length} cambiarían de nombre{' '}
              <span aria-hidden="true" className="text-border-strong">
                |
              </span>{' '}
              {unchangedCount} sin cambios
            </span>
          )}
        </div>

        {renamable.length > 0 && (
          <ul className="rounded-xl border border-border/50 divide-y divide-border/40 max-h-[40vh] overflow-y-auto">
            {renamable.map((item) => {
              const result = results[item.folderPath];
              const visual = visuals.get(item.folderPath);
              const title = visual?.title || item.oldName;
              return (
                <li key={item.folderPath}>
                  <label
                    className={`flex items-start gap-3 px-3 py-4 transition-colors ${
                      renaming || result ? 'cursor-default' : 'cursor-pointer hover:bg-secondary/40'
                    }`}
                  >
                    <span className="flex h-11 shrink-0 items-center">
                      <CustomCheckbox
                        checked={selected.has(item.folderPath)}
                        disabled={renaming || Boolean(result)}
                        onChange={() => toggle(item.folderPath)}
                        ariaLabel={`Renombrar ${item.oldName}`}
                      />
                    </span>
                    <RenameLibraryPoster poster={visual?.poster} title={title} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold leading-snug break-words">{title}</p>
                      <RenameLibraryComparison from={item.oldName} to={item.newName} />
                      {result && !result.ok && (
                        <p className="text-[11px] text-destructive-fg mt-0.5 leading-relaxed">{result.error}</p>
                      )}
                    </div>
                    {result?.ok && <Check className="w-3.5 h-3.5 text-success shrink-0" aria-label="Renombrada" />}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isIpcFailError, unwrap } from '@/renderer/hooks/queries/unwrap';
import { Dialog } from '@/renderer/components/Dialog';
import { CustomCheckbox } from '@/renderer/components/CustomCheckbox';
import { useLibrary } from '@/renderer/hooks/useQueries';
import { buildFilesRenameRows, type FilesRenamePreview } from '@/renderer/utils/filesRename';

interface FolderRow {
  name: string;
  path: string;
}

interface RenameLibraryFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirs: string[];
  style: 'minimal' | 'descriptive';
}

const STYLE_LABEL: Record<'minimal' | 'descriptive', string> = {
  minimal: 'Minimalista (EP_01)',
  descriptive: 'Descriptivo (Título + EP)',
};

const STATUS_LABEL: Record<string, string> = {
  conflict: 'Conflicto',
  skip_no_number: 'Sin número',
};

export function RenameLibraryFilesDialog({ open, onOpenChange, dirs, style }: RenameLibraryFilesDialogProps) {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useLibrary(dirs);
  const [previews, setPreviews] = useState<Record<string, FilesRenamePreview | null>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const selectionInitialized = useRef(false);

  const entries = useMemo(() => {
    const list = (rows as FolderRow[]) || [];
    return list.map((row) => ({ folderPath: row.path, folderName: row.name }));
  }, [rows]);

  const plan = useMemo(
    () => buildFilesRenameRows(entries.map((entry) => ({ ...entry, preview: previews[entry.folderPath] ?? null }))),
    [entries, previews],
  );
  const renamable = plan.filter((row) => row.toRename > 0);

  useEffect(() => {
    if (!selectionInitialized.current && renamable.length > 0) {
      selectionInitialized.current = true;
      setSelected(new Set(renamable.map((row) => row.folderPath)));
    }
  }, [renamable]);

  useEffect(() => {
    if (!open || entries.length === 0) return;
    let cancelled = false;
    setProgress({ done: 0, total: entries.length });
    (async () => {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (cancelled) return;
        let preview: FilesRenamePreview | null = null;
        try {
          preview = unwrap(
            await window.api.invoke('preview-rename-anime-files', {
              animePath: entry.folderPath,
              style,
            }),
            { toast: false },
          ) as FilesRenamePreview | null;
        } catch {
          preview = null;
        }
        if (cancelled) return;
        setPreviews((prev) => ({ ...prev, [entry.folderPath]: preview }));
        setProgress({ done: i + 1, total: entries.length });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, entries, style]);

  const toggle = (folderPath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const toggleExpanded = (folderPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const inspecting = progress.total > 0 && progress.done < progress.total;
  const pendingCount = renamable.filter((row) => selected.has(row.folderPath) && !results[row.folderPath]).length;

  const handleConfirm = async () => {
    setRenaming(true);
    const nextResults: Record<string, { ok: boolean; error?: string }> = { ...results };
    for (const row of renamable) {
      if (!selected.has(row.folderPath) || nextResults[row.folderPath]) continue;
      try {
        unwrap(
          await window.api.invoke('rename-anime-files', {
            animePath: row.folderPath,
            style,
          }),
          { toast: false },
        );
        nextResults[row.folderPath] = { ok: true };
      } catch (e: unknown) {
        nextResults[row.folderPath] = {
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
      toast.success(okCount === 1 ? '1 carpeta actualizada' : `${okCount} carpetas actualizadas`);
      onOpenChange(false);
    } else {
      toast.error(`Actualizadas ${okCount}. ${failCount} sin tocar; revisa la lista.`);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Renombrar archivos de la librería"
      message={`Se aplicará «${STYLE_LABEL[style]}» a los vídeos ya descargados.`}
      confirmLabel={renaming ? 'Renombrando…' : `Renombrar (${pendingCount})`}
      confirmDisabled={pendingCount === 0 || renaming || inspecting}
      confirmLoading={renaming}
      onConfirm={handleConfirm}
      className="max-w-2xl"
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Se renombran los archivos de episodio dentro de cada carpeta; las carpetas no se tocan. Los conflictos por
          nombre se omiten.
        </p>
        <div className="flex items-center gap-2 text-[13px] text-text-tertiary tabular-nums">
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Leyendo la librería…
            </span>
          ) : inspecting ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Inspeccionando… {progress.done}/{progress.total}
            </span>
          ) : (
            <span>
              {renamable.length} carpetas con cambios · {plan.length - renamable.length} al día
            </span>
          )}
        </div>

        {renamable.length > 0 && (
          <ul className="rounded-xl border border-border/50 divide-y divide-border/40 max-h-[40vh] overflow-y-auto">
            {renamable.map((row) => {
              const result = results[row.folderPath];
              const isOpen = expanded.has(row.folderPath);
              return (
                <li key={row.folderPath}>
                  <label
                    className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                      renaming || result ? 'cursor-default' : 'cursor-pointer hover:bg-secondary/40'
                    }`}
                  >
                    <CustomCheckbox
                      checked={selected.has(row.folderPath)}
                      disabled={renaming || Boolean(result)}
                      onChange={() => toggle(row.folderPath)}
                      ariaLabel={`Renombrar archivos de ${row.folderName}`}
                    />
                    <span className="min-w-0 flex-1 text-xs">
                      <span className="font-mono text-foreground truncate block">{row.folderName}</span>
                      <span className="text-text-tertiary tabular-nums">
                        {row.toRename} a renombrar
                        {row.conflicts > 0 && ` · ${row.conflicts} en conflicto`}
                        {row.skipped > 0 && ` · ${row.skipped} sin número`}
                      </span>
                    </span>
                    {result?.ok && <Check className="w-3.5 h-3.5 text-success shrink-0" aria-label="Renombrado" />}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleExpanded(row.folderPath);
                      }}
                      aria-expanded={isOpen}
                      aria-label={`Ver archivos de ${row.folderName}`}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </label>
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <ul className="px-3 pb-2 pt-1 space-y-1">
                        {row.items.map((item) => (
                          <li key={`${item.from}->${item.to}`} className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-muted-foreground truncate">{item.from}</span>
                            <span className="text-text-tertiary shrink-0" aria-hidden>
                              →
                            </span>
                            <span className="font-mono text-foreground truncate">
                              {item.to || '—'}
                              {STATUS_LABEL[item.status] && (
                                <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-warning">
                                  {STATUS_LABEL[item.status]}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

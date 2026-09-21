import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCcw,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CustomSelect } from '../../../components/CustomSelect';
import { Dialog } from '../../../components/Dialog';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useLogFilePage, useLogFilenames } from '../../../hooks/useQueries';
import { exportDiagnostics, revealLogFile } from '../../../utils/diagnosticsActions';
import { filterLogFilenames } from '../../../../utils/logPage';

const FILE_FILTER_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'backup', label: 'Respaldos' },
];

const PAGE_SIZE_OPTIONS = [
  { value: '5', label: '5 por página' },
  { value: '10', label: '10 por página' },
  { value: '20', label: '20 por página' },
];

export function levelTone(level: string): string {
  if (level === 'error') return 'text-destructive-fg';
  if (level === 'warn') return 'text-warning';
  if (level === 'info') return 'text-info';
  return 'text-muted-foreground';
}

export const MODAL_MAX_ENTRIES = 2000;

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function copyText(text: string, okMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      toast.success(okMessage);
    } catch {
      toast.error('No se pudo copiar');
    }
  }
}

function RowCheck({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <AppTooltip content={disabled ? 'La sesión en curso se conserva siempre.' : ''}>
      <span className="inline-flex shrink-0">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border border-border bg-background transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-40 data-[checked=true]:border-primary data-[checked=true]:bg-primary data-[checked=true]:text-primary-foreground"
          data-checked={checked}
        >
          {checked ? <Check className="w-3 h-3" /> : null}
        </button>
      </span>
    </AppTooltip>
  );
}

interface LogsTabProps {
  isActive?: boolean;
}

export const LogsTab = memo(function LogsTab({ isActive = true }: LogsTabProps) {
  const [fileFilter, setFileFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const filesQuery: any = useLogFilenames(isActive);
  const files: Array<{ name: string; size: number; mtimeMs: number; isCurrent: boolean }> = useMemo(
    () => filesQuery.data?.files || [],
    [filesQuery.data],
  );
  const currentName: string = filesQuery.data?.current || '';
  const filtered = useMemo(
    () =>
      filterLogFilenames(
        files.map((f) => f.name),
        fileFilter as any,
        currentName,
      ),
    [files, fileFilter, currentName],
  );
  const fileRows = useMemo(() => files.filter((f) => filtered.includes(f.name)), [files, filtered]);
  const pageCount = Math.max(1, Math.ceil(fileRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = fileRows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const eligibleAll = useMemo(() => fileRows.filter((f) => !f.isCurrent), [fileRows]);
  const allChecked = eligibleAll.length > 0 && eligibleAll.every((f) => selected.has(f.name));

  useEffect(() => {
    setPage(0);
  }, [fileFilter, files.length, pageSize]);

  useEffect(() => {
    setSelected(new Set());
  }, [fileFilter]);

  useEffect(() => {
    return () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
    };
  }, []);

  const handleReload = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await filesQuery.refetch();
    } catch {
    } finally {
      spinTimer.current = setTimeout(() => setSpinning(false), 400);
    }
  };

  const fileQuery: any = useLogFilePage(openFile, isActive && !!openFile);
  const modalEntries: any[] = useMemo(
    () => (fileQuery.data?.pages || []).flatMap((p: any) => p?.entries || []),
    [fileQuery.data],
  );

  const toggleFile = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (eligibleAll.every((f) => next.has(f.name))) {
        for (const f of eligibleAll) next.delete(f.name);
      } else {
        for (const f of eligibleAll) next.add(f.name);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    try {
      const res: any = await window.api.invoke('delete-log-files', { files: [...selected] });
      if (res?.ok === true) {
        toast.success(
          res.deleted === 1 ? 'Espacio liberado: 1 sesión anterior' : `Espacio liberado: ${res.deleted} sesiones`,
          res.skipped > 0 ? { description: `${res.skipped} omitida(s)` } : undefined,
        );
        if (openFile && selected.has(openFile)) setOpenFile(null);
        setSelected(new Set());
        await queryClient.invalidateQueries({ queryKey: ['log-filenames'] });
      } else {
        toast.error('Nada que liberar', { description: String(res?.error || 'Sin datos') });
      }
    } catch (e: any) {
      toast.error('No se pudo liberar espacio', { description: String(e?.message || e) });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  const handleCopyCurrent = async () => {
    if (copying || !currentName) return;
    setCopying(true);
    try {
      const res: any = await window.api.invoke('get-log-page', {
        level: 'all',
        scope: 'all',
        query: '',
        sessionOnly: false,
        filename: currentName,
        cursor: 0,
        limit: 500,
      });
      const entries = res?.entries || [];
      if (entries.length === 0) {
        toast.error('Esta sesión aún está en blanco');
        return;
      }
      const body = entries.map((e: any) => e.text).join('\n\n');
      await copyText(res?.nextCursor != null ? `${body}\n\n…[recortado]` : body, 'Sesión actual copiada');
    } catch {
      toast.error('No se pudo copiar la sesión');
    } finally {
      setCopying(false);
    }
  };

  const handleCopyModal = async () => {
    if (modalEntries.length === 0) return;
    await copyText(modalEntries.map((e: any) => e.text).join('\n\n'), 'Sesión copiada');
  };

  return (
    <>
      <section
        className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6"
        aria-label="Registro de sesiones"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <SquarePen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-[-0.015em]">Registro de sesiones</h3>
            <p className="text-xs text-muted-foreground">Un fichero por cada arranque de la aplicación</p>
          </div>
          <AppTooltip content="Recargar">
            <span className="ml-auto inline-flex">
              <button
                type="button"
                onClick={() => void handleReload()}
                disabled={filesQuery.isFetching || spinning}
                aria-label="Recargar registro"
                className="rounded-lg border border-border/70 bg-secondary p-2 text-foreground transition-colors hover:bg-secondary/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <RefreshCcw className={`h-4 w-4 ${filesQuery.isFetching || spinning ? 'animate-spin' : ''}`} />
              </button>
            </span>
          </AppTooltip>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-background p-3 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => void handleCopyCurrent()}
            disabled={copying || !currentName}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            {copying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            Copiar sesión actual
          </button>
          <button
            type="button"
            onClick={() => void revealLogFile()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Abrir carpeta
          </button>
        </div>

        <div className="mt-3">
          <CustomSelect
            value={fileFilter}
            options={FILE_FILTER_OPTIONS}
            onChange={setFileFilter}
            ariaLabel="Filtrar registro"
          />
        </div>

        <div className="mt-3 rounded-xl border border-border/60 bg-background overflow-hidden">
          {filesQuery.isLoading ? (
            <div className="flex items-center justify-center py-10" role="status" aria-label="Cargando registro">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filesQuery.isError ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
              <span>No se pudo abrir el registro.</span>
              <button
                type="button"
                onClick={() => filesQuery.refetch()}
                className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-xs font-semibold"
              >
                Reintentar
              </button>
            </div>
          ) : fileRows.length === 0 ? (
            <EmptyState title="Registro vacío" description="Todavía no hay sesiones guardadas en este equipo." />
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2.5">
                <RowCheck
                  checked={allChecked}
                  disabled={eligibleAll.length === 0}
                  label="Marcar todas las sesiones anteriores"
                  onToggle={toggleAll}
                />
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sesión</span>
                {selected.size > 0 ? (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {selected.size} {selected.size === 1 ? 'marcada' : 'marcadas'}
                    </span>
                    <span aria-hidden="true" className="text-[11px] text-border-strong">
                      /
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded"
                    >
                      Soltar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20 text-destructive-fg text-[11px] font-bold transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <Trash2 className="w-3 h-3" /> Liberar espacio
                    </button>
                  </span>
                ) : (
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {fileRows.length} {fileRows.length === 1 ? 'sesión' : 'sesiones'}
                  </span>
                )}
              </div>
              <ul className="divide-y divide-border/40">
                {visible.map((f) => (
                  <li key={f.name} className="[content-visibility:auto] [contain-intrinsic-size:auto_56px]">
                    <div className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40">
                      <RowCheck
                        checked={selected.has(f.name)}
                        disabled={f.isCurrent}
                        label={f.isCurrent ? 'Sesión en curso, no se puede marcar' : `Marcar ${f.name}`}
                        onToggle={() => toggleFile(f.name)}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenFile(f.name)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 rounded"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className="block truncate font-mono text-[13px] tabular-nums text-foreground">
                            {f.name}
                          </span>
                        </span>
                        <span className="block pl-6 text-[11px] text-muted-foreground tabular-nums">
                          {formatSize(f.size)}
                          {f.isCurrent ? ' · en curso' : ''}
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-1.5 px-3 py-2.5 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setPage(0)}
                  disabled={safePage === 0}
                  aria-label="Primera página"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  aria-label="Página anterior"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  aria-label="Página siguiente"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(pageCount - 1)}
                  disabled={safePage >= pageCount - 1}
                  aria-label="Última página"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
                <span className="mx-auto text-xs text-muted-foreground tabular-nums">
                  Página {safePage + 1} de {pageCount}
                </span>
                <CustomSelect
                  value={String(pageSize)}
                  options={PAGE_SIZE_OPTIONS}
                  onChange={(v) => setPageSize(Number(v) || 5)}
                  ariaLabel="Sesiones por página"
                />
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <FolderOpen className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Archivo y exportación</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Exporta el diagnóstico actual para revisarlo o compartirlo.
        </p>
        <button
          type="button"
          onClick={() => void exportDiagnostics({ sessionOnly: false })}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-secondary hover:bg-secondary/80 border border-border rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <Download className="w-4 h-4" /> Exportar registro
        </button>
      </section>

      <Dialog
        open={!!openFile}
        onOpenChange={(open) => {
          if (!open) setOpenFile(null);
        }}
        title={openFile || 'Sesión'}
        showFooter={false}
        hideDefaultIcon={true}
        className="max-w-3xl"
      >
        <div className="mb-3">
          <button
            type="button"
            onClick={() => void handleCopyModal()}
            disabled={modalEntries.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" /> Copiar al portapapeles
          </button>
        </div>
        <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
            {fileQuery.isLoading ? (
              <div className="flex items-center justify-center py-10" role="status" aria-label="Cargando sesión">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : fileQuery.isError ? (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">No se pudo leer esta página.</p>
            ) : modalEntries.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground text-center">Sesión vacía.</p>
            ) : (
              <ul>
                {modalEntries.map((e: any, i: number) => (
                  <li
                    key={`${e.ts}-${i}`}
                    className={`px-3 py-1.5 rounded-md font-mono text-xs leading-relaxed whitespace-pre-wrap break-all select-text tabular-nums ${i % 2 === 1 ? 'bg-secondary/30' : ''}`}
                  >
                    <span className="text-muted-foreground">{e.ts ? e.ts.replace('T', ' ').slice(0, 19) : ''}</span>
                    <span className={`font-bold ${levelTone(String(e.level))}`}>
                      {'  '}|{String(e.level).toUpperCase().slice(0, 3)}| {e.scope} &gt;{' '}
                    </span>
                    <span className="text-foreground/90">
                      {String(e.text).split('\n').slice(1).join('\n') || String(e.text)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {modalEntries.length >= MODAL_MAX_ENTRIES ? (
          <p className="mt-3 px-3 py-2 text-[11px] text-muted-foreground text-center">
            Mostrando las {MODAL_MAX_ENTRIES} más recientes. Exporta el registro para ver el resto.
          </p>
        ) : fileQuery.hasNextPage ? (
          <button
            type="button"
            onClick={() => fileQuery.fetchNextPage()}
            disabled={fileQuery.isFetchingNextPage}
            className="mt-3 w-full px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 border border-border/40 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            {fileQuery.isFetchingNextPage ? 'Cargando...' : 'Cargar más antiguas'}
          </button>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setConfirmOpen(open);
        }}
        title="¿Liberar espacio?"
        message={`Se quitarán ${selected.size} ${selected.size === 1 ? 'sesión anterior' : 'sesiones anteriores'} de este equipo. La que está en curso se conserva.`}
        confirmLabel="Liberar"
        cancelLabel="Conservar"
        danger={true}
        confirmLoading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
});

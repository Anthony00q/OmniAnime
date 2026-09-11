import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CustomSelect } from '../../../components/CustomSelect';
import { CustomSwitch } from '../../../components/CustomSwitch';
import { Dialog } from '../../../components/Dialog';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SearchField } from '../../../components/ui/SearchField';
import { useLogPages } from '../../../hooks/useQueries';
import { exportDiagnostics, revealLogFile } from '../../../utils/diagnosticsActions';
import { isDeletableEntry } from '../../../../utils/logPage';

const LEVEL_OPTIONS = [
  { value: 'all', label: 'Todos los niveles' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Avisos' },
  { value: 'error', label: 'Errores' },
];

const SCOPE_OPTIONS = [
  { value: 'all', label: 'Todos los módulos' },
  { value: 'app', label: 'app' },
  { value: 'queue', label: 'queue' },
  { value: 'download', label: 'download' },
  { value: 'provider', label: 'provider' },
  { value: 'db', label: 'db' },
  { value: 'settings', label: 'settings' },
  { value: 'window', label: 'window' },
  { value: 'splash', label: 'splash' },
  { value: 'protocol', label: 'protocol' },
  { value: 'ui', label: 'ui' },
  { value: 'ipc', label: 'ipc' },
  { value: 'updater', label: 'updater' },
];

const LEVEL_STYLE: Record<string, string> = {
  debug: 'bg-secondary text-muted-foreground border-border',
  info: 'bg-primary/10 text-primary border-primary/20',
  warn: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  error: 'bg-destructive/10 text-destructive-fg border-destructive/20',
  session: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
};

// Tope de páginas acumuladas: sin virtualizar, miles de filas degradan el scroll y la escritura.
const MAX_LOADED_ENTRIES = 1000;

function DeleteCheckbox({
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
    <AppTooltip
      content={
        disabled ? 'Solo se pueden eliminar entradas de hace más de 1 día; la sesión actual está protegida.' : ''
      }
    >
      <span className="inline-flex shrink-0">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={onToggle}
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border border-border bg-background transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-40 data-[checked=true]:border-primary data-[checked=true]:bg-primary data-[checked=true]:text-primary-foreground"
          data-checked={checked}
        >
          {checked ? <Check className="w-3 h-3" /> : null}
        </button>
      </span>
    </AppTooltip>
  );
}

const entryKey = (e: any): string => `${e.file || ''}\n${e.text}`;

const LogEntryRow = memo(function LogEntryRow({
  entry,
  index,
  checked,
  canDelete,
  open,
  collapsible,
  onToggle,
  onToggleOpen,
}: {
  entry: any;
  index: number;
  checked: boolean;
  canDelete: boolean;
  open: boolean;
  collapsible: boolean;
  onToggle: (entry: any) => void;
  onToggleOpen: (entry: any) => void;
}) {
  const e = entry;
  return (
    <li key={`${e.file || ''}-${e.ts}-${index}`} className="px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        <DeleteCheckbox
          checked={checked}
          disabled={!canDelete}
          label="Seleccionar entrada para eliminar"
          onToggle={() => onToggle(e)}
        />
        <span
          className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${LEVEL_STYLE[e.level] || LEVEL_STYLE.info}`}
        >
          {e.level}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground">{e.scope}</span>
        {e.ts ? (
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums ml-auto">
            {new Date(e.ts).toLocaleString()}
          </span>
        ) : null}
        {collapsible ? (
          <button
            type="button"
            onClick={() => onToggleOpen(e)}
            aria-expanded={open}
            aria-label={open ? 'Contraer entrada' : 'Expandir entrada'}
            className="inline-flex shrink-0 h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
          </button>
        ) : null}
      </div>
      {collapsible ? (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all select-text text-foreground/90">
              {e.text}
            </pre>
          </div>
        </div>
      ) : (
        <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all select-text text-foreground/90">
          {e.text}
        </pre>
      )}
    </li>
  );
});

interface LogsTabProps {
  isActive?: boolean;
  settings: any;
  onChange: (key: string, value: any, category?: string) => void;
}

export const LogsTab = memo(function LogsTab({ isActive = true, settings, onChange }: LogsTabProps) {
  const [level, setLevel] = useState('all');
  const [scope, setScope] = useState('all');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);
  const filters = useMemo(() => ({ level, scope, query: appliedQuery }), [level, scope, appliedQuery]);
  const logQuery: any = useLogPages(filters, isActive);
  const entries: any[] = useMemo(
    () => (logQuery.data?.pages || []).flatMap((p: any) => p?.entries || []),
    [logQuery.data],
  );
  const total = logQuery.data?.pages?.[0]?.total ?? 0;
  const sessionStart = (logQuery.data?.pages?.[0] as any)?.sessionStart || '';
  const logging = (settings as any)?.logging || {};
  const verbose = logging.verbose === true;
  const minLevel = typeof logging.level === 'string' ? logging.level : 'info';
  const queryClient = useQueryClient();
  // Por contenido: los duplicados identicos comparten clave y se borran juntos
  // (mismo contrato que removeLogEntries en main).
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setExpanded(new Set());
  }, [level, scope, appliedQuery]);

  const applySearch = () => setAppliedQuery(query.trim());
  const entryDeletable = useCallback(
    (ts: string): boolean => isDeletableEntry(ts, { now: Date.now(), sessionStart }),
    [sessionStart],
  );
  const toggleEntry = useCallback((entry: any) => {
    const key = entryKey(entry);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleOpen = useCallback((entry: any) => {
    const key = entryKey(entry);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const eligibleLoaded = useMemo(() => entries.filter((e: any) => entryDeletable(e.ts)), [entries, entryDeletable]);
  const allEligibleChecked = eligibleLoaded.length > 0 && eligibleLoaded.every((e: any) => selected.has(entryKey(e)));
  const toggleAllEligible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (eligibleLoaded.every((e: any) => next.has(entryKey(e)))) {
        for (const e of eligibleLoaded) next.delete(entryKey(e));
      } else {
        for (const e of eligibleLoaded) next.add(entryKey(e));
      }
      return next;
    });
  }, [eligibleLoaded]);
  // Filas visibles afectadas (los duplicados identicos cuentan cada uno).
  const affectedRows = useMemo(() => entries.filter((e: any) => selected.has(entryKey(e))).length, [entries, selected]);

  const handleDelete = async () => {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    try {
      const items = entries
        .filter((e: any) => selected.has(entryKey(e)))
        .map((e: any) => ({ file: e.file || '', text: e.text }));
      const res: any = await window.api.invoke('delete-log-entries', { items });
      if (res?.ok === true) {
        toast.success(
          res.deleted === 1 ? '1 entrada eliminada' : `${res.deleted} entradas eliminadas`,
          res.skipped > 0 ? { description: `${res.skipped} protegida(s) omitida(s)` } : undefined,
        );
        setSelected(new Set());
        await queryClient.invalidateQueries({ queryKey: ['log-page'] });
      } else {
        toast.error('No se pudieron eliminar', { description: String(res?.error || 'Sin datos') });
      }
    } catch (e: any) {
      toast.error('No se pudieron eliminar', { description: String(e?.message || e) });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Nivel de registro</h3>
        </div>
        <div className="rounded-xl border border-border/60 bg-background p-4 flex flex-col gap-1">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold select-none">
                Registro detallado
                <AppTooltip content="Guarda trazas de proveedores y reintentos. Cada sesión rota a 2 MB con una copia de respaldo y se conservan hasta 20 sesiones (unos 80 MB como máximo).">
                  <span aria-hidden="true" className="inline-flex text-muted-foreground">
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </AppTooltip>
              </span>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Guarda trazas de proveedores y reintentos. Úsalo solo para diagnosticar: ocupa más disco.
              </p>
            </div>
            <CustomSwitch
              checked={verbose}
              onChange={(c) => onChange('verbose', c, 'logging')}
              ariaLabel="Registro detallado"
            />
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground select-none">
              Nivel mínimo
              <AppTooltip content="De más a menos detalle: Debug, Info, Avisos, Errores. Con Errores solo se guarda lo grave y el visor muestra menos, no más.">
                <span aria-hidden="true" className="inline-flex text-muted-foreground">
                  <Info className="w-3.5 h-3.5" />
                </span>
              </AppTooltip>
            </span>
            <CustomSelect
              value={minLevel}
              options={LEVEL_OPTIONS.filter((o) => o.value !== 'all')}
              onChange={(v) => onChange('level', v, 'logging')}
              ariaLabel="Nivel mínimo de registro"
            />
          </div>
          {verbose ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Con el registro detallado el nivel efectivo es Debug.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">Se aplica al guardar los ajustes.</p>
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-sm font-bold tracking-tight">Visor del registro</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <AppTooltip
              content={
                <span className="block space-y-1">
                  <span className="block font-semibold">Módulos del registro</span>
                  <span className="block">
                    <span className="font-mono">app:</span> general
                  </span>
                  <span className="block">
                    <span className="font-mono">queue:</span> descargas
                  </span>
                  <span className="block">
                    <span className="font-mono">download:</span> motor y servidores
                  </span>
                  <span className="block">
                    <span className="font-mono">provider:</span> AnimeAV1 / JkAnime
                  </span>
                  <span className="block">
                    <span className="font-mono">db:</span> base de datos
                  </span>
                  <span className="block">
                    <span className="font-mono">settings:</span> ajustes
                  </span>
                  <span className="block">
                    <span className="font-mono">window:</span> ventana y bandeja
                  </span>
                  <span className="block">
                    <span className="font-mono">protocol:</span> imágenes locales
                  </span>
                  <span className="block">
                    <span className="font-mono">ui:</span> interfaz (llegan como app)
                  </span>
                  <span className="block">
                    <span className="font-mono">splash/ipc/updater:</span> arranque, IPC y updates
                  </span>
                </span>
              }
            >
              <span aria-hidden="true" className="inline-flex text-muted-foreground">
                <Info className="w-4 h-4" />
              </span>
            </AppTooltip>
            <button
              type="button"
              onClick={() => logQuery.refetch()}
              disabled={logQuery.isFetching}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${logQuery.isFetching ? 'animate-spin' : ''}`} />
              Recargar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <CustomSelect value={level} options={LEVEL_OPTIONS} onChange={setLevel} ariaLabel="Filtrar por nivel" />
          <CustomSelect value={scope} options={SCOPE_OPTIONS} onChange={setScope} ariaLabel="Filtrar por módulo" />
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onSubmit={applySearch}
            onClear={() => {
              setQuery('');
              setAppliedQuery('');
            }}
            placeholder="Buscar en el registro..."
            ariaLabel="Buscar en el registro"
          />
        </div>
        {logQuery.isLoading ? (
          <div className="flex items-center justify-center py-8" role="status" aria-label="Cargando registro">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : logQuery.isError ? (
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 text-sm text-muted-foreground flex items-center justify-between gap-3">
            <span>No se pudo leer el registro.</span>
            <button
              type="button"
              onClick={() => logQuery.refetch()}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold"
            >
              Reintentar
            </button>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="Sin entradas"
            description="No hay registros con esos filtros. Prueba con Todos los niveles o activa el registro detallado."
            actionLabel="Limpiar filtros"
            onAction={() => {
              setLevel('all');
              setScope('all');
              setQuery('');
              setAppliedQuery('');
            }}
          />
        ) : (
          <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
            <div className="px-3 py-2 border-b border-border/40 text-[11px] text-muted-foreground flex items-center gap-2">
              <DeleteCheckbox
                checked={allEligibleChecked}
                disabled={eligibleLoaded.length === 0}
                label="Seleccionar entradas visibles para eliminar"
                onToggle={toggleAllEligible}
              />
              <span>
                {entries.length} de {total} entradas
                {logQuery.isFetching ? ' · Actualizando...' : ''}
              </span>
              {selected.size > 0 ? (
                <span className="ml-auto flex items-center gap-2">
                  <span className="font-semibold text-foreground tabular-nums">{selected.size} sel.</span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="font-semibold text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20 text-destructive-fg text-[11px] font-bold transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                </span>
              ) : null}
            </div>
            <ul className="divide-y divide-border/40 max-h-[420px] overflow-y-auto custom-scrollbar">
              {entries.map((e: any, idx: number) => (
                <LogEntryRow
                  key={`${e.file || ''}-${e.ts}-${idx}`}
                  entry={e}
                  index={idx}
                  checked={selected.has(entryKey(e))}
                  canDelete={entryDeletable(e.ts)}
                  open={expanded.has(entryKey(e))}
                  collapsible={typeof e.text === 'string' && e.text.includes('\n')}
                  onToggle={toggleEntry}
                  onToggleOpen={toggleOpen}
                />
              ))}
            </ul>
            {entries.length >= MAX_LOADED_ENTRIES ? (
              <p className="px-3 py-2.5 text-[11px] text-muted-foreground border-t border-border/40">
                Mostrando las {MAX_LOADED_ENTRIES} primeras: afina los filtros para ver el resto.
              </p>
            ) : logQuery.hasNextPage ? (
              <button
                type="button"
                onClick={() => logQuery.fetchNextPage()}
                disabled={logQuery.isFetchingNextPage}
                className="w-full px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 border-t border-border/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
              >
                {logQuery.isFetchingNextPage ? 'Cargando...' : 'Cargar más antiguas'}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/50 bg-card shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <FolderOpen className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold tracking-tight">Archivo y exportación</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Muestra el archivo de registro en el explorador o exporta lo que ves en el visor con los filtros actuales
          (versión, servidores y cola, sin rutas personales).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void revealLogFile()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-secondary hover:bg-secondary/80 border border-border rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <FolderOpen className="w-4 h-4" /> Mostrar archivo
          </button>
          <button
            type="button"
            onClick={() => void exportDiagnostics(filters)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-secondary hover:bg-secondary/80 border border-border rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Download className="w-4 h-4" /> Exportar .log
          </button>
        </div>
      </section>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setConfirmOpen(open);
        }}
        title="¿Eliminar entradas del registro?"
        message={`Se eliminarán ${affectedRows} entrada(s) de hace más de 1 día. La sesión actual está protegida y no se toca.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        danger={true}
        confirmLoading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
});

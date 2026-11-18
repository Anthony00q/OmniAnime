import { AlertCircle, Check, FilePenLine, FolderPen, Info, Loader2, SearchX } from 'lucide-react';
import { Dialog } from '@/renderer/components/Dialog';
import { CustomSelect } from '@/renderer/components/CustomSelect';
import { SearchField } from '@/renderer/components/ui/SearchField';
import { FOLDER_NAME_SOURCE_OPTIONS } from '@/renderer/views/settings/constants';
import { useLibraryRenameSession } from '@/renderer/views/settings/hooks/useLibraryRenameSession';
import type { RenameFilter, RenameMode, RenameStep } from '@/renderer/views/settings/model/libraryRenameModel';
import type { FolderNameSource } from '@/utils/downloads/folderNaming';
import { LibraryRenameCollection } from './LibraryRenameCollection';
import { LibraryRenameInspector } from './LibraryRenameInspector';
import './libraryRename.css';
import { RenameLibrarySummary } from './RenameLibraryPreview';

export function LibraryRenameWorkspace({
  open,
  onOpenChange,
  dirs,
  mode,
  style = 'descriptive',
  source = 'provider',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirs: string[];
  mode: RenameMode;
  style?: 'minimal' | 'descriptive';
  source?: FolderNameSource;
}) {
  const session = useLibraryRenameSession(dirs, mode, style, source);
  const { counts, step, resultCounts } = session;
  const visiblePaths = new Set(session.visible.map((row) => row.path));
  const hiddenSelected = session.rows.filter(
    (row) => session.selected.has(row.path) && row.state === 'ready' && row.changes > 0 && !visiblePaths.has(row.path),
  ).length;
  const scopeCount = (session.library.data ?? []).filter(
    (row: { sourceDir: string }) => session.directory === 'all' || row.sourceDir === session.directory,
  ).length;
  const filters: { value: RenameFilter; label: string }[] =
    step === 'result'
      ? [
          { value: 'all', label: `Todos (${session.rows.length})` },
          { value: 'completed', label: `Completados (${resultCounts.completed})` },
          { value: 'issues', label: `Con incidencias (${resultCounts.issues})` },
          { value: 'not-included', label: `No incluidos (${resultCounts.notIncluded})` },
        ]
      : [
          { value: 'all', label: `Todos (${session.rows.length})` },
          { value: 'changes', label: `Con cambios (${counts.changes})` },
          { value: 'issues', label: `Incidencias (${counts.issues})` },
          { value: 'unchanged', label: `Sin cambios (${counts.unchanged})` },
        ];
  const noChanges = !session.inspecting && !session.busy && counts.changes === 0;
  const changeOpen = (value: boolean) => {
    if (!session.busy) onOpenChange(value);
  };
  const resultHasIssues = resultCounts.issues > 0 || Boolean(session.error);
  const standardFooter = step === 'prepare' || (step === 'review' && !session.hasResult && !noChanges);
  const confirmLabel = session.busy
    ? 'Renombrando…'
    : step === 'prepare'
      ? session.hasPreview
        ? 'Volver a la revisión'
        : 'Preparar vista previa'
      : step === 'result'
        ? 'Cerrar'
        : mode === 'files'
          ? `Renombrar ${counts.files} ${counts.files === 1 ? 'archivo' : 'archivos'}`
          : `Renombrar ${counts.selected} ${counts.selected === 1 ? 'carpeta' : 'carpetas'}`;
  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
      title={mode === 'files' ? 'Renombrar archivos de la librería' : 'Renombrar carpetas de la librería'}
      icon={mode === 'files' ? <FilePenLine className="h-5 w-5" /> : <FolderPen className="h-5 w-5" />}
      message="Revisa los nombres antes de aplicar los cambios."
      className="max-w-2xl library-rename-dialog"
      confirmLabel={confirmLabel}
      confirmLoading={session.busy}
      showFooter={standardFooter || session.inspecting}
      closeOnConfirm={false}
      dismissDisabled={session.busy}
      cancelLabel={step === 'prepare' ? 'Cancelar' : 'Cerrar'}
      confirmDisabled={
        step === 'prepare'
          ? session.blocked ||
            (!session.hasPreview && (session.library.isLoading || session.library.isError || !scopeCount))
          : step === 'review'
            ? session.inspecting || session.blocked || counts.selected === 0
            : session.busy
      }
      onConfirm={() =>
        step === 'prepare' ? session.prepare() : step === 'result' ? changeOpen(false) : session.apply()
      }
    >
      <div className="library-rename-workspace">
        <ol className="library-rename-steps" aria-label="Pasos del renombrado">
          {['Preparar', 'Revisar', 'Resultado'].map((label, index) => {
            const current = step === 'prepare' ? 0 : step === 'review' ? 1 : 2;
            return (
              <li key={label} aria-current={current === index ? 'step' : undefined}>
                <button
                  type="button"
                  className="library-rename-step"
                  aria-current={current === index ? 'step' : undefined}
                  disabled={
                    session.busy ||
                    session.blocked ||
                    (index === 1 && !session.hasPreview) ||
                    (index === 2 && (!session.hasResult || !session.hasPreview))
                  }
                  onClick={() => session.navigate((['prepare', 'review', 'result'] as RenameStep[])[index])}
                >
                  <span className="library-rename-step-number" aria-hidden="true">
                    {(index === 0 && session.hasPreview && current !== 0) ||
                    (index === 1 && session.hasResult && current !== 1) ? (
                      <Check aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
        {step === 'prepare' ? (
          <div className="space-y-4">
            <div className="library-rename-fields">
              <div className="space-y-2">
                <span className="block text-[13px] font-semibold">
                  {mode === 'files' ? 'Formato de los archivos' : 'Origen del nombre'}
                </span>
                <CustomSelect
                  value={mode === 'files' ? session.style : session.source}
                  className="w-full"
                  ariaLabel={mode === 'files' ? 'Formato de los archivos' : 'Origen del nombre'}
                  options={
                    mode === 'files'
                      ? [
                          { value: 'minimal', label: 'Minimalista (EP_01)' },
                          { value: 'descriptive', label: 'Descriptivo (Título + EP)' },
                        ]
                      : FOLDER_NAME_SOURCE_OPTIONS.map((option) => ({ ...option }))
                  }
                  onChange={(value) =>
                    mode === 'files'
                      ? session.setStyle(value as 'minimal' | 'descriptive')
                      : session.setSource(value as FolderNameSource)
                  }
                />
              </div>
              <div className="space-y-2">
                <span className="block text-[13px] font-semibold">Ubicación</span>
                <CustomSelect
                  value={session.directory}
                  onChange={session.setDirectory}
                  className="w-full"
                  ariaLabel="Ubicación del renombrado"
                  options={[
                    { value: 'all', label: 'Todas las ubicaciones' },
                    ...dirs.filter(Boolean).map((dir) => ({ value: dir, label: dir })),
                  ]}
                />
              </div>
            </div>
            {mode === 'folders' && (
              <div className="space-y-2">
                <span className="block text-[13px] font-semibold">Si el título elegido no está disponible</span>
                <CustomSelect
                  value={session.missingTitlePolicy}
                  ariaLabel="Títulos no disponibles"
                  className="w-full"
                  options={[
                    { value: 'fallback', label: 'Usar un título de respaldo' },
                    { value: 'skip', label: 'No incluir esa carpeta' },
                  ]}
                  onChange={(value) => session.setMissingTitlePolicy(value as 'fallback' | 'skip')}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Solo se aplica a esta operación; no cambia los ajustes de descargas nuevas.
            </p>
            <div className="library-rename-preparation">
              {session.library.isLoading ? (
                <p role="status" className="flex items-center gap-2">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Leyendo la librería…
                </p>
              ) : session.library.isError ? (
                <>
                  <p role="alert">No se pudo leer la librería.</p>
                  <button type="button" className="library-rename-link" onClick={() => void session.library.refetch()}>
                    Reintentar lectura
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold tabular-nums">
                    {scopeCount} {scopeCount === 1 ? 'carpeta para revisar' : 'carpetas para revisar'}
                  </p>
                  <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
                    {scopeCount
                      ? 'La vista previa no modifica archivos. Después podrás elegir qué carpetas incluir.'
                      : 'No hay carpetas en esta ubicación.'}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {step === 'result' && (
              <div className="library-rename-overall" role="status">
                {resultHasIssues ? (
                  <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
                ) : (
                  <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-success" />
                )}
                <div>
                  <h3 className="text-base font-semibold">
                    {session.error
                      ? 'No se pudo completar el renombrado'
                      : resultHasIssues
                        ? 'Renombrado con incidencias'
                        : 'Renombrado completado'}
                  </h3>
                  <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
                    <RenameLibrarySummary
                      text={[
                        resultCounts.renamed === 0 && session.rows.some((row) => row.state === 'uncertain')
                          ? 'No hay cambios confirmados'
                          : resultCounts.renamed === 0
                            ? mode === 'files'
                              ? 'No se renombraron archivos'
                              : 'No se renombraron carpetas'
                            : mode === 'files'
                              ? `${resultCounts.renamed} ${resultCounts.renamed === 1 ? 'archivo renombrado' : 'archivos renombrados'}`
                              : `${resultCounts.renamed} ${resultCounts.renamed === 1 ? 'carpeta renombrada' : 'carpetas renombradas'}`,
                        resultCounts.processed > 0
                          ? `${resultCounts.processed} ${resultCounts.processed === 1 ? 'carpeta procesada' : 'carpetas procesadas'}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' | ')}
                    />
                  </p>
                </div>
              </div>
            )}
            <div className="library-rename-toolbar">
              <SearchField
                value={session.query}
                onChange={session.setQuery}
                onClear={() => session.setQuery('')}
                ariaLabel="Buscar en el renombrado"
                placeholder="Buscar anime o carpeta…"
              />
              {step === 'result' && (
                <button
                  type="button"
                  disabled={session.busy || session.blocked}
                  className="library-rename-link"
                  onClick={session.startNewReview}
                >
                  Nueva revisión
                </button>
              )}
            </div>
            <div className="library-rename-filters" aria-label="Filtrar revisión">
              {filters.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  aria-pressed={session.filter === item.value}
                  onClick={() => session.setFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {(step !== 'result' || resultCounts.issues > 0 || resultCounts.notIncluded > 0) && (
              <div className="library-rename-selection">
                {step === 'review' && !session.hasResult && !noChanges && (
                  <div className="flex flex-wrap gap-x-4">
                    <button
                      type="button"
                      className="library-rename-link"
                      disabled={session.inspecting || session.blocked}
                      onClick={() => session.selectVisible(true)}
                    >
                      Seleccionar visibles
                    </button>
                    <button
                      type="button"
                      className="library-rename-link"
                      disabled={session.inspecting || session.blocked}
                      onClick={() => session.selectVisible(false)}
                    >
                      Quitar visibles
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground tabular-nums" role="status">
                  <RenameLibrarySummary
                    text={
                      session.busy || session.inspecting
                        ? `${session.busy ? 'Aplicando' : 'Revisando'} ${session.progress.done} de ${session.progress.total}`
                        : step === 'result'
                          ? [
                              resultCounts.issues
                                ? `${resultCounts.issues} ${resultCounts.issues === 1 ? 'carpeta con incidencias' : 'carpetas con incidencias'}`
                                : '',
                              resultCounts.notIncluded ? `${resultCounts.notIncluded} sin incluir` : '',
                            ]
                              .filter(Boolean)
                              .join(' | ')
                          : session.hasResult
                            ? 'Vista previa de una operación terminada.'
                            : noChanges
                              ? mode === 'files'
                                ? 'No hay archivos que renombrar.'
                                : counts.issues > 0
                                  ? 'No hay cambios listos. Revisa las incidencias.'
                                  : 'No hay cambios de nombre con las opciones actuales.'
                              : `${counts.selected} ${counts.selected === 1 ? 'seleccionada' : 'seleccionadas'}${hiddenSelected ? ` | ${hiddenSelected} fuera del filtro` : ''}`
                    }
                  />
                </p>
              </div>
            )}
            {(session.busy || session.inspecting) && (
              <div
                className="library-rename-progress"
                role="progressbar"
                aria-label={session.busy ? 'Aplicando cambios' : 'Revisando carpetas'}
                aria-valuemin={0}
                aria-valuemax={session.progress.total || 1}
                aria-valuenow={session.progress.done}
              >
                <div
                  style={{
                    transform: `scaleX(${session.progress.total ? session.progress.done / session.progress.total : 0})`,
                  }}
                />
              </div>
            )}
            {session.visible.length > 0 ? (
              <div className="library-rename-panels">
                <LibraryRenameCollection
                  rows={session.visible}
                  activePath={session.active?.path}
                  selected={session.selected}
                  disabled={session.inspecting || session.blocked || step !== 'review'}
                  readonly={session.hasResult}
                  resultView={step === 'result'}
                  onInspect={session.setActivePath}
                  onInclude={session.toggle}
                />
                <LibraryRenameInspector session={session} mode={mode} />
              </div>
            ) : (
              <div className="library-rename-empty" role="status">
                <SearchX aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-semibold">
                  {session.filter === 'issues' && !session.query
                    ? 'No hay incidencias en esta revisión.'
                    : 'No hay carpetas para estos filtros.'}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {hiddenSelected > 0
                    ? 'Las selecciones fuera del filtro se conservan.'
                    : 'Puedes cambiar la búsqueda o mostrar todas las carpetas.'}
                </p>
                <button
                  type="button"
                  className="library-rename-link"
                  onClick={() => {
                    session.setQuery('');
                    session.setFilter('all');
                  }}
                >
                  Mostrar todos
                </button>
              </div>
            )}
            {step === 'review' && !session.hasResult && !session.inspecting && !noChanges && (
              <p className="mt-3 text-[13px] text-muted-foreground tabular-nums">
                {mode === 'files'
                  ? `${counts.files} ${counts.files === 1 ? 'archivo' : 'archivos'} en ${counts.selected} ${counts.selected === 1 ? 'carpeta' : 'carpetas'}`
                  : `${counts.selected} ${counts.selected === 1 ? 'carpeta seleccionada' : 'carpetas seleccionadas'}`}
              </p>
            )}
          </>
        )}
        {session.error && step === 'result' && (
          <p role="alert" className="mt-4 flex items-center gap-2 text-[13px] text-destructive-fg">
            <AlertCircle aria-hidden="true" className="h-4 w-4" />
            {session.error}
          </p>
        )}
        {step !== 'result' && (
          <p className="library-rename-note">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {mode === 'files'
                ? 'Se conservan números, decimales, extensiones e idioma. Las carpetas no cambian de nombre.'
                : 'Los vídeos conservan sus nombres. Las carpetas permanecen en su ubicación.'}{' '}
              Las descargas pendientes, activas o pausadas bloquean el renombrado. No se sobrescriben destinos ocupados.
            </span>
          </p>
        )}
        {!standardFooter && !session.inspecting && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={session.busy}
              onClick={() => changeOpen(false)}
              className="min-h-11 min-w-24 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)]"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

import { useState } from 'react';
import { AlertCircle, Link2, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { AniListLinkDialog } from '@/renderer/views/animeDetails/components/AniListLinkDialog';
import { CustomInput } from '@/renderer/components/CustomInput';
import { CustomSelect } from '@/renderer/components/CustomSelect';
import { folderRenameCandidates, FOLDER_CANDIDATE_LABELS } from '@/renderer/utils/folderRename';
import { resolveFolderName } from '@/utils/downloads/folderNaming';
import type { LibraryRenameSession } from '@/renderer/views/settings/hooks/useLibraryRenameSession';
import type { RenameMode } from '@/renderer/views/settings/model/libraryRenameModel';
import { RenameLibraryComparison, RenameLibraryResult, RenameLibrarySummary } from './RenameLibraryPreview';

export function LibraryRenameInspector({ session, mode }: { session: LibraryRenameSession; mode: RenameMode }) {
  const [linkPath, setLinkPath] = useState<string | null>(null);
  const row = session.active;
  if (!row)
    return (
      <aside className="library-rename-inspector">
        <p className="text-[13px] text-muted-foreground">Selecciona una carpeta para revisar sus cambios.</p>
      </aside>
    );
  const candidates = folderRenameCandidates(
    { folderPath: row.path, folderName: row.name, meta: row.meta ?? null },
    session.titles[row.path],
  );
  const override = session.overrides[row.path];
  const resolved = resolveFolderName(
    {
      providerTitle: row.meta?.title,
      providerAlternativeTitles: row.meta?.alternativeTitles,
      japaneseTitle: row.meta?.secondaryTitle,
      anilist: session.titles[row.path],
    },
    session.source,
  );
  const candidateKey = session.customPaths.has(row.path)
    ? 'custom'
    : override === undefined
      ? 'global'
      : (candidates.find((item) => item.name === override)?.id ?? 'custom');
  const editable =
    session.step === 'review' && !session.hasResult && !session.inspecting && !session.blocked && row.state === 'ready';
  const phase = session.hasResult ? (row.result?.state === 'done' ? 'done' : 'incomplete') : 'preview';
  const changedItems = row.items.filter((item) => item.status !== 'already_correct');
  return (
    <aside className="library-rename-inspector" aria-label="Vista previa del renombrado">
      <h3 className="text-base font-semibold leading-snug break-words">{row.metaTitle || row.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground break-all select-text">{row.sourceDir}</p>
      {row.result && <RenameLibraryResult result={row.result} />}
      {row.state === 'pending' ? (
        <p className="mt-5 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4" /> Pendiente de revisión
        </p>
      ) : (
        <>
          {mode === 'folders' && editable && (
            <div className="mt-4 space-y-2">
              <span className="block text-[13px] font-medium">Nombre de esta carpeta</span>
              <CustomSelect
                value={candidateKey}
                ariaLabel="Nombre de esta carpeta"
                className="w-full"
                wrapOptions
                options={[
                  { value: 'global', label: 'Usar el origen elegido' },
                  ...candidates.map((item) => ({ value: item.id, label: `${item.label}: ${item.name}` })),
                  { value: 'custom', label: 'Nombre personalizado' },
                ]}
                onChange={(value) =>
                  session.setOverride(
                    row.path,
                    value === 'global'
                      ? null
                      : value === 'custom'
                        ? ''
                        : candidates.find((item) => item.id === value)!.name,
                    value === 'custom',
                  )
                }
              />
              {candidateKey === 'custom' && (
                <CustomInput
                  value={override ?? ''}
                  focusTone="neutral"
                  ariaLabel="Nombre personalizado"
                  onChange={(value) => session.setOverride(row.path, value, true)}
                  placeholder={row.name}
                />
              )}
            </div>
          )}
          {mode === 'folders' && !session.hasResult && row.providerId && row.metaSlug && (
            <>
              <div className="library-rename-inspector-actions" role="group" aria-label="Acciones de AniList">
                <button
                  type="button"
                  disabled={session.inspecting || session.blocked}
                  onClick={() => setLinkPath(row.path)}
                >
                  <Link2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                  Revisar vínculo AniList
                </button>
                <button
                  type="button"
                  disabled={session.inspecting || session.blocked}
                  onClick={() => void session.retryInspection(row)}
                >
                  <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />
                  Actualizar títulos
                </button>
              </div>
              {linkPath === row.path && (
                <AniListLinkDialog
                  open
                  providerId={row.providerId}
                  slug={row.metaSlug}
                  defaultQuery={row.metaTitle || row.name}
                  currentId={row.meta?.anilistId}
                  onClose={() => setLinkPath(null)}
                  onLinked={() => {
                    void session.retryInspection(row);
                  }}
                />
              )}
            </>
          )}
          {mode === 'folders' && row.state !== 'error' && !row.omitted && (
            <>
              <div className="mt-4">
                <RenameLibraryComparison from={row.name} to={row.newName || ''} phase={phase} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                {override !== undefined
                  ? 'Nombre elegido solo para esta carpeta.'
                  : resolved.key
                    ? `Origen usado: ${FOLDER_CANDIDATE_LABELS[resolved.key]}.${resolved.key !== session.source ? ' Se usa un título de respaldo.' : ''}`
                    : 'No hay un título disponible en los metadatos.'}
                {row.lang === 'DUB' && ' Se conserva el sufijo [DUB].'}
              </p>
            </>
          )}
          {mode === 'files' && row.state !== 'error' && (
            <>
              {!row.result && (row.changes > 0 || row.conflicts > 0 || row.skipped > 0) && (
                <p className="mt-4 text-xs text-muted-foreground tabular-nums">
                  <RenameLibrarySummary
                    text={[
                      row.changes > 0 ? `${row.changes} ${row.changes === 1 ? 'cambio' : 'cambios'}` : '',
                      row.conflicts > 0 ? `${row.conflicts} ${row.conflicts === 1 ? 'conflicto' : 'conflictos'}` : '',
                      row.skipped > 0 ? `${row.skipped} sin número` : '',
                    ]
                      .filter(Boolean)
                      .join(' | ')}
                  />
                </p>
              )}
              <div className="library-rename-files mt-3" aria-label="Cambios de archivos">
                {changedItems.length ? (
                  changedItems.map((item) => (
                    <div className="library-rename-file" key={item.from}>
                      <RenameLibraryComparison from={item.from} to={item.to} filename phase={phase} />
                      {item.status === 'conflict' && (
                        <p className="mt-2 text-xs text-warning">Destino ocupado. No se sobrescribe.</p>
                      )}
                      {item.status === 'skip_no_number' && (
                        <p className="mt-2 text-xs text-muted-foreground">No se reconoce el número del episodio.</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="library-rename-nochange text-[13px] text-muted-foreground">
                    {row.preview?.summary?.total === 1
                      ? 'El archivo ya tiene este formato.'
                      : 'Los archivos ya tienen este formato.'}
                  </p>
                )}
              </div>
            </>
          )}
          {row.error && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-[13px] text-destructive-fg leading-relaxed">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {row.error}
            </p>
          )}
          {row.notice && (
            <p role="note" className="mt-4 text-[13px] text-muted-foreground">
              {row.notice}
            </p>
          )}
          {row.titlesNotice && (
            <p role="note" className="mt-4 text-[13px] text-muted-foreground">
              {row.titlesNotice}
            </p>
          )}
          {row.state === 'error' && session.step === 'review' && !session.hasResult && (
            <button
              type="button"
              className="library-rename-link mt-2"
              disabled={session.inspecting || session.blocked}
              onClick={() => void session.retryInspection(row)}
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Reintentar inspección
            </button>
          )}
        </>
      )}
    </aside>
  );
}

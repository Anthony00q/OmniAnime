import { memo } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { CustomCheckbox } from '@/renderer/components/CustomCheckbox';
import { getRenameLibraryVisual } from '@/renderer/views/settings/utils/renameLibraryPresentation';
import { RenameLibraryPoster } from './RenameLibraryPreview';
import {
  canIncludeRename,
  hasRenameIssue,
  type LibraryRenameEntry,
} from '@/renderer/views/settings/model/libraryRenameModel';

const RenameCollectionRow = memo(function RenameCollectionRow({
  row,
  active,
  included,
  disabled,
  readonly,
  resultView,
  onInspect,
  onInclude,
}: {
  row: LibraryRenameEntry;
  active: boolean;
  included: boolean;
  disabled: boolean;
  readonly: boolean;
  resultView: boolean;
  onInspect: (path: string) => void;
  onInclude: (path: string, included: boolean) => void;
}) {
  const { title, poster } = getRenameLibraryVisual(row);
  const status =
    row.state === 'uncertain'
      ? 'Sin confirmar'
      : row.state === 'not-started'
        ? 'No iniciado'
        : resultView && !row.result && row.state === 'ready'
          ? 'No incluido'
          : row.state === 'pending'
            ? 'Pendiente de revisión'
            : row.state === 'error'
              ? 'No se pudo revisar'
              : row.state === 'done'
                ? 'Completado'
                : row.state === 'partial'
                  ? 'Cambios parciales'
                  : row.state === 'failed'
                    ? 'No completado'
                    : row.changes > 0
                      ? `${row.changes} ${row.changes === 1 ? 'cambio' : 'cambios'}`
                      : row.conflicts > 0 || row.skipped > 0
                        ? 'Requiere revisión'
                        : 'Sin cambios';
  return (
    <li className="library-rename-row" data-selected={active || undefined}>
      {!readonly && (
        <div className="library-rename-check">
          <CustomCheckbox
            checked={included && canIncludeRename(row)}
            disabled={disabled || !canIncludeRename(row)}
            onChange={(value) => onInclude(row.path, value)}
            ariaLabel={`Incluir ${title}`}
          />
        </div>
      )}
      <button
        type="button"
        className="library-rename-item"
        aria-pressed={active}
        aria-label={`Revisar ${title}`}
        onClick={() => onInspect(row.path)}
      >
        <RenameLibraryPoster poster={poster} title={title} compact />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-snug break-words">{title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {row.providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1'}{' '}
            <span aria-hidden="true" className="text-border-strong">
              {' '}
              |{' '}
            </span>{' '}
            {row.lang || 'SUB'}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
            {row.state === 'pending' ? (
              <Loader2 aria-hidden="true" className="h-3 w-3" />
            ) : row.state === 'done' ? (
              <Check aria-hidden="true" className="h-3 w-3 text-success" />
            ) : hasRenameIssue(row) ? (
              <AlertCircle aria-hidden="true" className="h-3 w-3" />
            ) : null}
            {status}
          </span>
        </span>
      </button>
    </li>
  );
});

export function LibraryRenameCollection({
  rows,
  activePath,
  selected,
  disabled,
  readonly,
  resultView,
  onInspect,
  onInclude,
}: {
  rows: LibraryRenameEntry[];
  activePath?: string;
  selected: ReadonlySet<string>;
  disabled: boolean;
  readonly: boolean;
  resultView: boolean;
  onInspect: (path: string) => void;
  onInclude: (path: string, included: boolean) => void;
}) {
  return rows.length ? (
    <ul className="library-rename-collection" aria-label="Carpetas revisadas" data-readonly={readonly || undefined}>
      {rows.map((row) => (
        <RenameCollectionRow
          key={row.path}
          row={row}
          active={row.path === activePath}
          included={selected.has(row.path)}
          disabled={disabled}
          readonly={readonly}
          resultView={resultView}
          onInspect={onInspect}
          onInclude={onInclude}
        />
      ))}
    </ul>
  ) : (
    <p className="py-10 px-3 text-center text-[13px] text-muted-foreground">No hay carpetas para estos filtros.</p>
  );
}

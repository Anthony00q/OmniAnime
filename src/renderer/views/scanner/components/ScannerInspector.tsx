import { Check, Link2, LockKeyhole } from 'lucide-react';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { resolveScannerRelinkProvider } from '@/renderer/views/scanner/model/relinkPolicy';
import {
  getScannerDirectoryLabel,
  getScannerFolderTitle,
  getScannerProviderLabel,
  type ScannerFolder,
} from '@/renderer/views/scanner/model/scannerModel';

interface ScannerInspectorProps {
  folder: ScannerFolder;
  activeProvider: string;
  id: string;
  isPending: boolean;
  onRelink: (folder: ScannerFolder) => void;
}

export function ScannerInspector({ folder, activeProvider, id, isPending, onRelink }: ScannerInspectorProps) {
  const title = getScannerFolderTitle(folder);
  const relinkDisabled = resolveScannerRelinkProvider(folder, activeProvider) === null;
  const providerLabel = getScannerProviderLabel(folder, activeProvider);
  const disabledReasonId = `${id}-reason`;
  const StatusIcon = relinkDisabled ? LockKeyhole : folder.metaSlug ? Check : Link2;

  return (
    <section id={id} className="scanner-inspector" aria-label="Detalles de la carpeta seleccionada">
      <div className="scanner-inspector-heading">
        <PosterImage
          src={folder.posterLocal || folder.poster}
          alt={`Carátula de ${title}`}
          className="scanner-inspector-poster"
          priority
        />
        <div className="min-w-0">
          <p className={`scanner-inspector-status ${!folder.metaSlug && !relinkDisabled ? 'text-destructive-fg' : ''}`}>
            <StatusIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {relinkDisabled ? 'Otro proveedor' : folder.metaSlug ? 'Vinculada' : 'Sin vínculo'}
          </p>
          <h2>{title}</h2>
          <p className="scanner-inspector-summary">
            <span className="tabular-nums">{folder.episodeCount} episodios</span>
            <span aria-hidden="true" className="scanner-meta-divider" />
            <span>{folder.lang || 'SUB'}</span>
          </p>
        </div>
      </div>

      <dl className="scanner-inspector-fields">
        <div>
          <dt>Carpeta local</dt>
          <dd>{folder.name}</dd>
        </div>
        <div>
          <dt>Vínculo actual</dt>
          <dd>{folder.metaSlug ? folder.metaTitle || title : 'Sin asignar'}</dd>
        </div>
        <div>
          <dt>Ubicación</dt>
          <dd>{getScannerDirectoryLabel(folder.sourceDir)}</dd>
        </div>
        <div>
          <dt>Proveedor</dt>
          <dd>{providerLabel}</dd>
        </div>
      </dl>

      <div className="scanner-inspector-actions">
        <button
          type="button"
          data-keep-focus
          disabled={relinkDisabled || isPending}
          aria-describedby={relinkDisabled ? disabledReasonId : undefined}
          className="scanner-relink-button"
          onClick={() => onRelink(folder)}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {folder.metaSlug ? 'Cambiar vínculo' : 'Vincular anime'}
        </button>
        {relinkDisabled ? (
          <p id={disabledReasonId} role="note" className="scanner-inspector-help">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Para modificar este vínculo, cambia a {providerLabel} en la barra lateral.
          </p>
        ) : !folder.metaSlug ? (
          <p className="scanner-inspector-help">Busca el anime que corresponde a esta carpeta para vincularla.</p>
        ) : null}
      </div>
    </section>
  );
}

import { memo } from 'react';
import { Check, Link2, LockKeyhole } from 'lucide-react';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { resolveScannerRelinkProvider } from '@/renderer/views/scanner/model/relinkPolicy';
import {
  getScannerFolderTitle,
  getScannerProviderLabel,
  type ScannerFolder,
} from '@/renderer/views/scanner/model/scannerModel';

interface ScannerCollectionProps {
  folders: ScannerFolder[];
  selectedPath: string;
  activeProvider: string;
  inspectorId: string;
  onSelect: (path: string) => void;
}

export const ScannerCollection = memo(function ScannerCollection({
  folders,
  selectedPath,
  activeProvider,
  inspectorId,
  onSelect,
}: ScannerCollectionProps) {
  return (
    <section className="scanner-collection" aria-label="Carpetas de la librería">
      <div className="scanner-section-heading">
        <h2>Carpetas</h2>
        <span className="tabular-nums">{folders.length}</span>
      </div>
      <ul className="scanner-folder-list">
        {folders.map((folder) => {
          const title = getScannerFolderTitle(folder);
          const blocked = resolveScannerRelinkProvider(folder, activeProvider) === null;
          const StatusIcon = blocked ? LockKeyhole : folder.metaSlug ? Check : Link2;
          return (
            <li key={folder.path} className="scanner-folder-item">
              <button
                type="button"
                data-keep-focus
                aria-pressed={selectedPath === folder.path}
                aria-controls={inspectorId}
                className="scanner-folder-button"
                onClick={() => onSelect(folder.path)}
              >
                <PosterImage
                  src={folder.posterLocal || folder.poster}
                  alt={`Carátula de ${title}`}
                  className="scanner-folder-poster"
                />
                <span className="min-w-0 flex-1">
                  <span className="scanner-folder-title">{title}</span>
                  <span className="scanner-folder-meta">
                    <span className="tabular-nums">{folder.episodeCount} ep.</span>
                    <span aria-hidden="true" className="scanner-meta-divider" />
                    <span>{getScannerProviderLabel(folder, activeProvider)}</span>
                  </span>
                  <span className={`scanner-folder-state ${!folder.metaSlug && !blocked ? 'text-destructive-fg' : ''}`}>
                    <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {blocked ? 'Otro proveedor' : folder.metaSlug ? 'Vinculada' : 'Sin vínculo'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

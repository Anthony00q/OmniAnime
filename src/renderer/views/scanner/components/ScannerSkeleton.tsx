import { useScannerDirectories } from '@/renderer/views/scanner/hooks/useScannerDirectories';
import { ScannerLayout } from './ScannerLayout';
import { ScannerToolbar } from './ScannerToolbar';
import '@/renderer/views/scanner/scanner.css';

export function ScannerSkeleton() {
  return (
    <div className="scanner-workspace" role="status" aria-label="Cargando carpetas">
      <div className="scanner-collection" aria-hidden="true">
        <div className="scanner-section-heading">
          <h2>Carpetas</h2>
          <span>—</span>
        </div>
        <ul className="scanner-folder-list">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="scanner-folder-item">
              <div className="scanner-folder-button">
                <div className="scanner-folder-poster bg-secondary" />
                <div className="min-w-0 flex-1">
                  <div className="scanner-folder-title">
                    <span className="block w-3/4 rounded bg-secondary">&nbsp;</span>
                  </div>
                  <div className="scanner-folder-meta">
                    <span className="block w-1/2 rounded bg-secondary">&nbsp;</span>
                  </div>
                  <div className="scanner-folder-state">
                    <span className="block w-16 rounded bg-secondary">&nbsp;</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="scanner-inspector" aria-hidden="true">
        <div className="scanner-inspector-heading">
          <div className="scanner-inspector-poster bg-secondary" />
          <div className="min-w-0 flex-1">
            <div className="scanner-inspector-status">
              <span className="block w-24 rounded bg-secondary">&nbsp;</span>
            </div>
            <h2>
              <span className="block w-3/4 rounded bg-secondary">&nbsp;</span>
            </h2>
            <div className="scanner-inspector-summary">
              <span className="block w-32 rounded bg-secondary">&nbsp;</span>
            </div>
          </div>
        </div>
        <dl className="scanner-inspector-fields">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index}>
              <dt>
                <span className="block w-24 rounded bg-secondary">&nbsp;</span>
              </dt>
              <dd>
                <span className="block w-3/5 rounded bg-secondary">&nbsp;</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="scanner-inspector-actions">
          <div className="h-11 w-40 rounded-lg bg-secondary" />
        </div>
      </div>
    </div>
  );
}

export function ScannerLoadingView() {
  const dirs = useScannerDirectories();
  return (
    <ScannerLayout toolbar={<ScannerToolbar dirs={dirs} isLoading placeholder />}>
      <ScannerSkeleton />
    </ScannerLayout>
  );
}

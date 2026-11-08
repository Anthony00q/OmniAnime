import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { getScannerDirectoryLabel, type ScannerStatusFilter } from '@/renderer/views/scanner/model/scannerModel';

interface ScannerToolbarProps {
  dirs: string[];
  counts?: Record<ScannerStatusFilter, number>;
  isLoading?: boolean;
  placeholder?: boolean;
  selectedDirFilter?: string;
  search?: ReactNode;
  statusFilter?: ScannerStatusFilter;
  onDirectoryChange?: (dir: string) => void;
  onStatusChange?: (status: ScannerStatusFilter) => void;
}

const EMPTY_COUNTS = { all: 0, missing: 0, linked: 0 };
export const SCANNER_SEARCH_LABEL = 'Buscar en tus carpetas';

export function ScannerToolbar({
  dirs,
  counts = EMPTY_COUNTS,
  isLoading = false,
  placeholder = false,
  selectedDirFilter = 'all',
  search,
  statusFilter = 'all',
  onDirectoryChange,
  onStatusChange,
}: ScannerToolbarProps) {
  return (
    <div
      data-empty-filters
      className="scanner-toolbar shrink-0"
      inert={placeholder || undefined}
      aria-hidden={placeholder || undefined}
    >
      <div className="scanner-locations">
        {dirs.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ubicación de las carpetas">
            {['all', ...dirs].map((dir) => (
              <button
                key={dir}
                data-keep-focus
                onClick={() => onDirectoryChange?.(dir)}
                aria-pressed={selectedDirFilter === dir}
                className={`relative h-8 max-w-[200px] shrink-0 truncate rounded-full border px-3 text-[13px] font-medium transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 ${
                  selectedDirFilter === dir
                    ? 'border-primary/30 bg-primary/15 text-primary'
                    : 'border-border/70 bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {dir === 'all' ? 'Todas' : getScannerDirectoryLabel(dir)}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto text-[13px] font-medium tabular-nums text-text-tertiary">
          {isLoading ? '—' : counts.all} {counts.all === 1 ? 'carpeta' : 'carpetas'}
        </span>
      </div>
      {search ?? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <div className="flex h-11 items-center rounded-lg border border-border/70 bg-surface pl-11 pr-11 text-sm text-muted-foreground">
            {SCANNER_SEARCH_LABEL}
          </div>
        </div>
      )}
      <div className="scanner-status-filters" role="group" aria-label="Estado del vínculo">
        {(
          [
            ['all', 'Todas'],
            ['missing', 'Sin vínculo'],
            ['linked', 'Vinculadas'],
          ] as const
        ).map(([status, label]) => (
          <button
            key={status}
            data-keep-focus
            className="scanner-status-filter"
            aria-pressed={statusFilter === status}
            onClick={() => onStatusChange?.(status)}
          >
            {label}
            <span>{isLoading ? '—' : counts[status]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

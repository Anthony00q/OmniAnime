import type { ReactNode, Ref } from 'react';
import { RefreshCcw } from 'lucide-react';
import { PageHeader } from '@/renderer/components/ui/PageHeader';

interface ScannerLayoutProps {
  children: ReactNode;
  toolbar: ReactNode;
  onRefresh?: () => void;
  refreshRef?: Ref<SVGSVGElement>;
  refreshDisabled?: boolean;
  revealContent?: boolean;
}

export function ScannerLayout({
  children,
  toolbar,
  onRefresh,
  refreshRef,
  refreshDisabled = true,
  revealContent = false,
}: ScannerLayoutProps) {
  return (
    <div className="scanner-surface empty-state-page flex flex-col h-full bg-background">
      <PageHeader
        title="Escáner de librería"
        description="Revisa los vínculos de tus carpetas locales"
        className="scanner-header sticky top-0"
        actions={
          <button
            onClick={onRefresh}
            data-keep-focus
            disabled={refreshDisabled}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-default disabled:opacity-50"
          >
            <RefreshCcw ref={refreshRef} className="w-4 h-4" aria-hidden="true" />
            <span>Escanear directorio</span>
          </button>
        }
      />
      {toolbar}
      <div
        data-view-scroller
        data-scanner-ready={revealContent || undefined}
        className="scanner-scroller empty-state-scroller min-h-0 flex-1 overflow-y-auto p-4 sm:px-8 sm:py-6 [scrollbar-gutter:stable]"
      >
        {children}
      </div>
    </div>
  );
}

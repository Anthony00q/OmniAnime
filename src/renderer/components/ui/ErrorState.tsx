import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'No se pudo cargar esta sección',
  description = 'Comprueba la conexión e inténtalo de nuevo.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      className="flex h-64 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground select-none"
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive-fg">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm">{description}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      )}
    </div>
  );
}

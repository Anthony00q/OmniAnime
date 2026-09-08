import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  className?: string;
  label?: string;
}

export function LoadingState({ className = 'h-40', label = 'Cargando' }: LoadingStateProps) {
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-label={label}>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

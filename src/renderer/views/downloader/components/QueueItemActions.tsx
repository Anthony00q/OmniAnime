import { FolderOpen, Loader2, Pause, Play, RefreshCw, SkipForward, Trash2, X, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';

interface QueueItemActionsProps {
  isDownloading: boolean;
  isPaused: boolean;
  isTerminal: boolean;
  canRetry: boolean;
  isRetryPending: boolean;
  isSwitchPending: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onOpenFolder: () => void;
  onRemove: () => void;
  onCancel: () => void;
}

function Action({
  label,
  Icon,
  onClick,
  disabled = false,
  busy = false,
  tone = 'neutral',
}: {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
}) {
  return (
    <AppTooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-busy={busy || undefined}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
          tone === 'primary'
            ? 'bg-primary/10 text-primary hover:bg-primary/20'
            : tone === 'danger'
              ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive-fg'
              : 'text-foreground hover:bg-secondary'
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </AppTooltip>
  );
}

export const QueueItemActions = memo(function QueueItemActions({
  isDownloading,
  isPaused,
  isTerminal,
  canRetry,
  isRetryPending,
  isSwitchPending,
  onPause,
  onResume,
  onSkip,
  onRetry,
  onOpenFolder,
  onRemove,
  onCancel,
}: QueueItemActionsProps) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {isDownloading && <Action label="Pausar descarga" Icon={Pause} onClick={onPause} />}
      {isPaused && <Action label="Reanudar descarga" Icon={Play} onClick={onResume} tone="primary" />}
      {isDownloading && (
        <Action
          label={isSwitchPending ? 'Cambiando servidor…' : 'Saltar servidor'}
          Icon={SkipForward}
          onClick={onSkip}
          disabled={isSwitchPending}
          busy={isSwitchPending}
        />
      )}
      {isTerminal && canRetry && (
        <Action
          label="Reintentar fallidos"
          Icon={RefreshCw}
          onClick={onRetry}
          disabled={isRetryPending}
          busy={isRetryPending}
          tone="primary"
        />
      )}
      {isTerminal && <Action label="Abrir carpeta" Icon={FolderOpen} onClick={onOpenFolder} />}
      {isTerminal || isPaused ? (
        <Action label="Quitar de la cola" Icon={Trash2} onClick={onRemove} tone="danger" />
      ) : (
        <Action label="Cancelar descarga" Icon={X} onClick={onCancel} tone="danger" />
      )}
    </div>
  );
});

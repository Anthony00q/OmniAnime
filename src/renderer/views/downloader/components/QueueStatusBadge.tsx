import { Ban, CheckCircle2, Clock, PauseCircle, PlayCircle, XCircle, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import { StatusBadge, type StatusVariant } from '@/renderer/components/ui/StatusBadge';
import { MOTION_DURATION, useEmphasis } from '@/renderer/utils/motion';

export type QueueBadgeKind = 'done' | 'failed' | 'cancelled' | 'paused' | 'downloading' | 'queued';

const BADGES: Record<QueueBadgeKind, { variant: StatusVariant; label: string; Icon: LucideIcon }> = {
  done: { variant: 'success', label: 'Finalizado', Icon: CheckCircle2 },
  failed: { variant: 'danger', label: 'Con errores', Icon: XCircle },
  cancelled: { variant: 'cancelled', label: 'Cancelado', Icon: Ban },
  paused: { variant: 'neutral', label: 'Pausada', Icon: PauseCircle },
  downloading: { variant: 'info', label: 'Descargando', Icon: PlayCircle },
  queued: { variant: 'neutral', label: 'En Cola', Icon: Clock },
};

export const QueueStatusBadge = memo(function QueueStatusBadge({ kind }: { kind: QueueBadgeKind }) {
  const isTerminal = kind === 'done' || kind === 'failed';
  const badgeRef = useEmphasis<HTMLSpanElement>(kind, { mode: 'fade', duration: MOTION_DURATION.base });
  const iconRef = useEmphasis<HTMLSpanElement>(isTerminal ? kind : null, { mode: 'pulse' });
  const { variant, label, Icon } = BADGES[kind];
  return (
    <span ref={badgeRef} className="inline-flex">
      <StatusBadge
        variant={variant}
        label={label}
        icon={
          <span ref={iconRef} className="inline-flex shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </span>
        }
        className="px-2 py-0.5 text-[11px]"
      />
    </span>
  );
});

import { Toaster, type ToasterProps } from 'sonner';
import type { ToastPosition } from '@/renderer/store/atoms';
import { useToastReconcile } from '@/renderer/hooks/useDownloadNotifications';
import { NOTIFICATION_DURATION } from '@/utils/notificationPolicy';

const toastOptions: ToasterProps['toastOptions'] = {
  className: 'flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold max-w-sm select-none',
  closeButtonAriaLabel: 'Cerrar notificación',
  style: {
    background: 'var(--color-popover)',
    border: '1px solid var(--color-border-strong)',
    borderRadius: '12px',
    color: 'var(--color-popover-foreground)',
    boxShadow: 'none',
  },
};

export function AppToaster({ position }: { position: ToastPosition }) {
  useToastReconcile();
  return (
    <Toaster
      theme="dark"
      position={position}
      visibleToasts={3}
      duration={NOTIFICATION_DURATION.normal}
      closeButton
      containerAriaLabel="Notificaciones"
      richColors
      gap={12}
      offset={{ top: '48px', bottom: '16px', left: '16px', right: '16px' }}
      toastOptions={toastOptions}
    />
  );
}

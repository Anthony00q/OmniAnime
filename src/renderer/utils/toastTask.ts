import { toast } from 'sonner';
import { NOTIFICATION_DURATION } from '@/utils/notificationPolicy';

interface ToastTaskOptions<T> {
  loading: string;
  success: (result: T) => string | null;
  error: string;
  timeoutMs: number;
  description?: (result: T) => string | undefined;
  pendingDescription?: string;
}

export async function runToastTask<T>(task: () => Promise<T>, options: ToastTaskOptions<T>): Promise<T> {
  const id = toast.loading(options.loading);
  const isActive = () => toast.getToasts().some((entry) => entry.id === id);
  const showUnconfirmed = () => {
    if (!isActive()) return;
    toast.info('La operación está tardando más de lo esperado', {
      id,
      duration: NOTIFICATION_DURATION.unconfirmed,
      description:
        options.pendingDescription ||
        'El resultado aún no se ha confirmado. Comprueba el estado antes de volver a intentarlo.',
    });
  };
  const timer = setTimeout(showUnconfirmed, options.timeoutMs);
  try {
    const result = await task();
    if (isActive()) {
      const message = options.success(result);
      if (message === null) toast.dismiss(id);
      else
        toast.success(message, {
          id,
          duration: NOTIFICATION_DURATION.normal,
          description: options.description?.(result),
        });
    }
    return result;
  } catch (error) {
    if (isActive()) {
      const code = (error as { code?: unknown } | null)?.code;
      const message = error instanceof Error ? error.message : '';
      if (code === 'IPC_TIMEOUT' || message.includes('tardó demasiado')) showUnconfirmed();
      else toast.error(options.error, { id, duration: NOTIFICATION_DURATION.error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type DownloadNotificationPreference = 'showDownloadStarted' | 'showDownloadFinished' | 'showDownloadError';

interface NotificationPreferences {
  notificationsSound?: boolean;
  notificationSettings?: Partial<Record<DownloadNotificationPreference | 'showSystemMessages', boolean>>;
}

export const NOTIFICATION_DURATION = { normal: 4000, error: 6000, unconfirmed: 8000 } as const;

export function resolveDownloadNotification(
  settings: NotificationPreferences,
  event: DownloadNotificationPreference,
  foreground: boolean,
): { enabled: boolean; toast: boolean; native: boolean } {
  const enabled = settings.notificationSettings?.[event] !== false;
  return { enabled, toast: enabled && foreground, native: enabled && !foreground };
}

export function createNotificationDeduper(limit = 512): (id: unknown) => boolean {
  const received = new Set<string>();
  return (id) => {
    if (typeof id !== 'string' || !id) return true;
    if (received.has(id)) return false;
    received.add(id);
    if (received.size > limit) received.delete(received.values().next().value!);
    return true;
  };
}

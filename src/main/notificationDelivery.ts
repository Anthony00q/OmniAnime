import {
  createNotificationDeduper,
  resolveDownloadNotification,
  type DownloadNotificationPreference,
} from '../utils/notificationPolicy';

interface NativeNotificationDependencies {
  getSettings: () => {
    notificationSettings?: Partial<Record<DownloadNotificationPreference | 'showSystemMessages', boolean>>;
  };
  isForeground: () => boolean;
  show: (message: { title: string; body: string; silent: true }) => void;
  reportError: (error: unknown) => void;
}

export function createNativeNotificationSender(dependencies: NativeNotificationDependencies) {
  const accept = createNotificationDeduper();
  return (
    title: string,
    body: string,
    event: DownloadNotificationPreference | 'showSystemMessages' = 'showSystemMessages',
    eventId?: string,
  ): void => {
    if (!accept(eventId)) return;
    try {
      const settings = dependencies.getSettings();
      const foreground = dependencies.isForeground();
      const enabled =
        event === 'showSystemMessages'
          ? settings.notificationSettings?.showSystemMessages !== false && !foreground
          : resolveDownloadNotification(settings, event, foreground).native;
      if (enabled) dependencies.show({ title, body, silent: true });
    } catch (error) {
      dependencies.reportError(error);
    }
  };
}

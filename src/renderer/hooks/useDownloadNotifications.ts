import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { toast, useSonner } from 'sonner';
import { settingsAtom } from '@/renderer/store/atoms';
import { playNotificationSound } from '@/renderer/utils/sound';
import type { DownloadStartedEvent, EpisodeDownloadedEvent } from '@/types/queue';
import {
  createNotificationDeduper,
  NOTIFICATION_DURATION,
  resolveDownloadNotification,
} from '@/utils/notificationPolicy';

const MAX_VISIBLE_TOASTS = 3;
const acceptNotification = createNotificationDeduper();

function isForeground(presentation?: 'toast' | 'native'): boolean {
  return presentation !== 'native' && document.visibilityState === 'visible' && document.hasFocus();
}

function dismissOverflowingToasts(): void {
  const activeToasts = toast.getToasts().filter((entry) => !('type' in entry && entry.type === 'loading'));
  const important = activeToasts.filter(
    (entry) => 'type' in entry && (entry.type === 'error' || entry.type === 'warning'),
  );
  const transient = activeToasts.filter((entry) => !important.includes(entry));
  const capacity = Math.max(0, MAX_VISIBLE_TOASTS - important.length);
  const toDismiss = transient.slice(0, Math.max(0, transient.length - capacity));
  for (const entry of toDismiss) {
    toast.dismiss(entry.id);
  }
}

export function useDownloadNotifications(): void {
  const settings = useAtomValue(settingsAtom);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const handleDownloadStarted = (data: DownloadStartedEvent) => {
      if (!acceptNotification(data.eventId)) return;
      const { animeTitle, episodesCount, slug } = data;
      const currentSettings = settingsRef.current;
      const delivery = resolveDownloadNotification(
        currentSettings,
        'showDownloadStarted',
        isForeground(data.presentation),
      );
      if (delivery.enabled) {
        const id = `download-started-${data.eventId || slug || animeTitle}`;
        if (delivery.toast)
          toast.info('Descarga iniciada', {
            id,
            duration: NOTIFICATION_DURATION.normal,
            description: `${animeTitle} | ${episodesCount === 1 ? '1 episodio' : `${episodesCount} episodios`}`,
          });
        playNotificationSound(currentSettings, 'download');
        dismissOverflowingToasts();
      }
    };

    const handleEpisodeDownloaded = (data: EpisodeDownloadedEvent) => {
      if (!acceptNotification(data.eventId)) return;
      const { slug, episode, success, animeTitle } = data;
      const title = animeTitle || slug;
      const currentSettings = settingsRef.current;

      const delivery = resolveDownloadNotification(
        currentSettings,
        success ? 'showDownloadFinished' : 'showDownloadError',
        isForeground(data.presentation),
      );
      if (success) {
        if (delivery.enabled) {
          const id = `episode-${data.eventId || `${slug}-${episode}`}`;
          if (delivery.toast)
            toast.success(`Episodio ${episode} descargado`, {
              id,
              duration: NOTIFICATION_DURATION.normal,
              description: title,
            });
          playNotificationSound(currentSettings, 'success');
          dismissOverflowingToasts();
        }
      } else {
        if (delivery.enabled) {
          const id = `episode-${data.eventId || `${slug}-${episode}`}-error`;
          if (delivery.toast)
            toast.error(`No se pudo descargar el episodio ${episode}`, {
              id,
              duration: NOTIFICATION_DURATION.error,
              description: `${title}. Revisa el motivo en Descargas.`,
            });
          playNotificationSound(currentSettings, 'error');
          dismissOverflowingToasts();
        }
      }
    };

    const unsubscribeStarted = window.api.on('download-started', handleDownloadStarted);
    const unsubscribeDownloaded = window.api.on('episode-downloaded', handleEpisodeDownloaded);

    return () => {
      unsubscribeStarted();
      unsubscribeDownloaded();
    };
  }, []);
}

export function useToastReconcile(): void {
  const { toasts } = useSonner();
  useEffect(() => {
    dismissOverflowingToasts();
  }, [toasts]);
  useEffect(() => {
    const reconcileToasts = () => {
      if (document.visibilityState === 'visible') {
        dismissOverflowingToasts();
      }
    };

    document.addEventListener('visibilitychange', reconcileToasts);
    window.addEventListener('focus', reconcileToasts);

    return () => {
      document.removeEventListener('visibilitychange', reconcileToasts);
      window.removeEventListener('focus', reconcileToasts);
    };
  }, []);
}

export { dismissOverflowingToasts };

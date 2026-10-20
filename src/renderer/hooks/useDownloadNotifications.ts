import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { toast } from 'sonner';
import { settingsAtom } from '@/renderer/store/atoms';
import { playNotificationSound } from '@/renderer/utils/sound';
import type { DownloadStartedEvent, EpisodeDownloadedEvent } from '@/types/queue';

const MAX_VISIBLE_TOASTS = 3;
const MAX_RECEIVED_NOTIFICATIONS = 512;
const receivedNotifications = new Set<string>();

function acceptNotification(eventId: unknown): boolean {
  if (typeof eventId !== 'string' || !eventId) return true;
  if (receivedNotifications.has(eventId)) return false;
  receivedNotifications.add(eventId);
  if (receivedNotifications.size > MAX_RECEIVED_NOTIFICATIONS) {
    receivedNotifications.delete(receivedNotifications.values().next().value!);
  }
  return true;
}

function dismissOverflowingToasts(): void {
  const activeToasts = toast.getToasts();
  if (activeToasts.length <= MAX_VISIBLE_TOASTS) return;
  const toDismiss = activeToasts.slice(0, activeToasts.length - MAX_VISIBLE_TOASTS);
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
      if (currentSettings.notificationSettings?.showDownloadStarted !== false) {
        const id = `download-started-${data.eventId || slug || animeTitle}`;
        toast.info(`Descargando: ${animeTitle} (${episodesCount} ep.)`, { id });
        playNotificationSound(currentSettings, 'download');
        setTimeout(dismissOverflowingToasts, 50);
      }
    };

    const handleEpisodeDownloaded = (data: EpisodeDownloadedEvent) => {
      if (!acceptNotification(data.eventId)) return;
      const { slug, episode, success, animeTitle } = data;
      const title = animeTitle || slug;
      const currentSettings = settingsRef.current;

      if (success) {
        if (currentSettings.notificationSettings?.showDownloadFinished !== false) {
          const id = `episode-${data.eventId || `${slug}-${episode}`}`;
          toast.success(`Descargado: ${title} - EP ${episode}`, { id });
          playNotificationSound(currentSettings, 'success');
          setTimeout(dismissOverflowingToasts, 50);
        }
      } else {
        if (currentSettings.notificationSettings?.showDownloadError !== false) {
          const id = `episode-${data.eventId || `${slug}-${episode}`}-error`;
          toast.error(`Fallo: ${title} - EP ${episode}`, { id });
          playNotificationSound(currentSettings, 'error');
          setTimeout(dismissOverflowingToasts, 50);
        }
      }
    };

    window.api.on('download-started', handleDownloadStarted);
    window.api.on('episode-downloaded', handleEpisodeDownloaded);

    return () => {
      window.api.removeListener('download-started', handleDownloadStarted);
      window.api.removeListener('episode-downloaded', handleEpisodeDownloaded);
    };
  }, []);
}

export function useToastReconcile(): void {
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

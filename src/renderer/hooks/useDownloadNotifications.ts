import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { toast } from 'sonner';
import { settingsAtom } from '../store/atoms';
import { playNotificationSound } from '../utils/sound';

const MAX_VISIBLE_TOASTS = 3;

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
    const handleDownloadStarted = (data: any) => {
      const { animeTitle, episodesCount, slug } = data;
      const currentSettings = settingsRef.current;
      if (currentSettings.notificationSettings?.showDownloadStarted !== false) {
        const id = `download-started-${slug || animeTitle}`;
        toast.info(`Descargando: ${animeTitle} (${episodesCount} ep.)`, { id });
        playNotificationSound(currentSettings, 'download');
        setTimeout(dismissOverflowingToasts, 50);
      }
    };

    const handleEpisodeDownloaded = (data: any) => {
      const { slug, episode, success, animeTitle } = data;
      const title = animeTitle || slug;
      const currentSettings = settingsRef.current;

      if (success) {
        if (currentSettings.notificationSettings?.showDownloadFinished !== false) {
          const id = `episode-${slug}-${episode}`;
          toast.success(`Descargado: ${title} - EP ${episode}`, { id });
          playNotificationSound(currentSettings, 'success');
          setTimeout(dismissOverflowingToasts, 50);
        }
      } else {
        if (currentSettings.notificationSettings?.showDownloadError !== false) {
          const id = `episode-${slug}-${episode}-error`;
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

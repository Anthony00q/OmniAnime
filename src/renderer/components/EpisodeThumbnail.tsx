import { Play, Image as ImageIcon } from 'lucide-react';
import { useVideoThumbnail } from '@/renderer/hooks/useQueries';

interface EpisodeThumbnailProps {
  videoPath: string;
  // '' = decorativa: el botón padre ya nombra la acción vía aria-label.
  alt?: string;
  className?: string;
  thumbToken?: number;
}

export function EpisodeThumbnail({ videoPath, alt = '', className = '', thumbToken = 0 }: EpisodeThumbnailProps) {
  const { elementRef, src: thumbSrc, onImageError } = useVideoThumbnail(videoPath, thumbToken);

  return (
    <div
      ref={elementRef}
      className={`library-episode-thumbnail relative aspect-video w-full overflow-hidden rounded-lg bg-secondary/50 ${className}`}
    >
      {thumbSrc ? (
        <img src={thumbSrc} alt={alt} draggable={false} onError={onImageError} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
        </div>
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/10 transition-colors group-hover/episode-thumb:bg-transparent"
      />
      <div
        aria-hidden="true"
        className="library-episode-play absolute inset-0 flex items-center justify-center opacity-0 group-hover/episode-thumb:opacity-100 group-focus-visible/episode-thumb:opacity-100 transition-opacity duration-120"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white">
          <Play className="ml-0.5 h-5 w-5 fill-current" />
        </div>
      </div>
    </div>
  );
}

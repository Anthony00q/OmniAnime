import { useState, useEffect, useRef } from 'react';
import { Play, Image as ImageIcon } from 'lucide-react';

interface EpisodeThumbnailProps {
  videoPath: string;
  // '' = decorativa: el botón padre ya nombra la acción vía aria-label.
  alt?: string;
  className?: string;
  thumbToken?: number;
}

export function EpisodeThumbnail({ videoPath, alt = '', className = '', thumbToken = 0 }: EpisodeThumbnailProps) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const seenTokenRef = useRef(thumbToken);

  useEffect(() => {
    if (seenTokenRef.current !== thumbToken) {
      seenTokenRef.current = thumbToken;
      setThumbSrc(null);
    }
  }, [thumbToken]);

  useEffect(() => {
    let isMounted = true;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !thumbSrc) {
          window.api
            .invoke('get-video-thumbnail', videoPath)
            .then((src: string) => {
              if (isMounted && src) {
                setThumbSrc(src);
              }
            })
            .catch(console.error);

          observer.disconnect();
        }
      },
      { rootMargin: '50px' },
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [videoPath, thumbSrc]);

  return (
    <div
      className={`relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-secondary/50 transition-[box-shadow] group-hover:ring-2 group-hover:ring-primary sm:h-auto sm:aspect-video sm:w-48 ${className}`}
    >
      {thumbSrc ? (
        <img ref={imgRef} src={thumbSrc} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div ref={imgRef} className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center text-primary-foreground shadow-lg backdrop-blur-sm">
          <Play className="w-5 h-5 fill-current ml-1" />
        </div>
      </div>
    </div>
  );
}

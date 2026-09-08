import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import clsx from 'clsx';

interface PosterImageProps {
  src?: string | null;
  alt: string;
  fallbackLabel?: string;
  className?: string;
  priority?: boolean;
  draggable?: boolean;
}

export function PosterImage({ src, alt, fallbackLabel, className, priority = false, draggable }: PosterImageProps) {
  const [hasError, setHasError] = useState(false);
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  const hasSource = normalizedSrc.length > 0;

  useEffect(() => {
    setHasError(false);
  }, [normalizedSrc]);

  if (!hasSource || hasError) {
    return (
      <div
        className={clsx(
          'flex flex-col items-center justify-center gap-2 bg-surface text-center text-muted-foreground/50',
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="h-8 w-8 opacity-40" aria-hidden="true" />
        {fallbackLabel && (
          <span className="line-clamp-3 px-4 text-[11px] font-semibold uppercase tracking-wider">{fallbackLabel}</span>
        )}
      </div>
    );
  }

  return (
    <img
      src={normalizedSrc}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      draggable={draggable}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

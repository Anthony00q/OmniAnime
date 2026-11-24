import { useState } from 'react';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { useHeroReveal } from '@/renderer/utils/motion';

interface DetailsHeroBannerProps {
  src: string;
  title: string;
  priority: boolean;
  onDimNode: (node: HTMLDivElement | null) => void;
}

export function DetailsHeroBanner({ src, title, priority, onDimNode }: DetailsHeroBannerProps) {
  const [status, setStatus] = useState<'pending' | 'ready' | 'failed'>('pending');
  const ready = status === 'ready';
  const revealRef = useHeroReveal<HTMLDivElement>(ready ? src : null);

  if (status === 'failed') return null;

  return (
    <div ref={revealRef} className={`absolute inset-0 ${ready ? '' : 'invisible opacity-0'}`}>
      <div ref={onDimNode} className="absolute inset-0">
        <PosterImage
          src={src}
          alt={`Banner de ${title}`}
          priority={priority}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('failed')}
          className="h-full w-full object-cover object-[center_20%]"
        />
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-black/20" />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/35 to-transparent"
      />
      <div aria-hidden="true" className="hero-top-fade" />
      <div aria-hidden="true" className="hero-bottom-fade" />
    </div>
  );
}

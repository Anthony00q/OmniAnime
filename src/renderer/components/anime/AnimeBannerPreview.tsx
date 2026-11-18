import { useState } from 'react';

export function AnimeBannerPreview({ src, title }: { src?: string | null; title: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return src && failed !== src ? (
    <img
      src={src}
      alt={`Banner de ${title}`}
      draggable={false}
      onError={() => setFailed(src)}
      className="h-28 w-full rounded-lg object-cover"
    />
  ) : (
    <p className="text-[13px] text-muted-foreground">
      {src
        ? 'No se pudo cargar la vista previa del banner.'
        : 'Esta entrada no tiene banner. El vínculo sigue siendo válido.'}
    </p>
  );
}

import { PosterImage } from '@/renderer/components/anime/PosterImage';

export function RenameLibraryPoster({ poster, title }: { poster?: string | null; title: string }) {
  return (
    <PosterImage
      src={poster}
      alt={`Póster de ${title}`}
      fallbackLabel="Sin póster"
      draggable={false}
      className="h-24 w-16 shrink-0 rounded-lg object-cover [&]:text-muted-foreground [&>span]:px-1 [&>span]:normal-case [&>span]:tracking-normal [&>svg]:h-5 [&>svg]:w-5"
    />
  );
}

export function RenameLibraryComparison({
  from,
  to,
  filename = false,
}: {
  from: string;
  to: string;
  filename?: boolean;
}) {
  return (
    <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs leading-relaxed">
      <dt className="text-text-tertiary">Actual</dt>
      <dd className={`min-w-0 break-all text-muted-foreground ${filename ? 'font-mono' : ''}`}>{from}</dd>
      <dt className="text-text-tertiary">Nuevo</dt>
      <dd className={`min-w-0 break-all text-foreground ${filename ? 'font-mono' : 'font-medium'}`}>{to || '—'}</dd>
    </dl>
  );
}

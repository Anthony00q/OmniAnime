import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { AlertCircle, Check } from 'lucide-react';
import type { LibraryRenameOutcome } from '@/renderer/hooks/queries/libraryRename';
import { presentRenameOutcome } from '@/renderer/views/settings/model/libraryRenameModel';

export function RenameLibraryResult({ result }: { result: LibraryRenameOutcome }) {
  const presentation = presentRenameOutcome(result);
  return (
    <div className="library-rename-result" role="status">
      {result.state === 'done' ? (
        <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-success" />
      ) : (
        <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-relaxed">{presentation.title}</p>
        {presentation.details.length > 0 && (
          <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground leading-relaxed select-text">
            {presentation.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function RenameLibrarySummary({ text }: { text: string }) {
  return (
    <span>
      {text.split(' | ').map((part, index) => (
        <span key={index}>
          {index > 0 && (
            <>
              {' '}
              <span aria-hidden="true" className="text-border-strong">
                |
              </span>{' '}
            </>
          )}
          {part}
        </span>
      ))}
    </span>
  );
}

export function RenameLibraryPoster({
  poster,
  title,
  compact = false,
}: {
  poster?: string | null;
  title: string;
  compact?: boolean;
}) {
  return (
    <PosterImage
      src={poster}
      alt={`Póster de ${title}`}
      fallbackLabel={compact ? undefined : 'Sin póster'}
      draggable={false}
      className={`${compact ? 'h-[84px] w-14 rounded' : 'h-24 w-16 rounded-lg'} shrink-0 object-cover [&]:text-muted-foreground [&>span]:px-1 [&>span]:normal-case [&>span]:tracking-normal [&>svg]:h-5 [&>svg]:w-5`}
    />
  );
}

export function RenameLibraryComparison({
  from,
  to,
  filename = false,
  phase = 'preview',
}: {
  from: string;
  to: string;
  filename?: boolean;
  phase?: 'preview' | 'done' | 'incomplete';
}) {
  return (
    <dl className="library-rename-names">
      <div>
        <dt className="library-rename-label">{phase === 'preview' ? 'Nombre actual' : 'Nombre anterior'}</dt>
        <dd className={`library-rename-name text-muted-foreground ${filename ? 'font-mono' : ''}`}>{from}</dd>
      </div>
      <div>
        <dt className="library-rename-label">
          {phase === 'done' ? 'Nombre final' : phase === 'incomplete' ? 'Nombre previsto' : 'Nombre nuevo'}
        </dt>
        <dd className={`library-rename-name text-foreground ${filename ? 'font-mono' : 'font-medium'}`}>{to || '—'}</dd>
      </div>
    </dl>
  );
}

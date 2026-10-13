import { useEffect, useRef, useState } from 'react';
import { Link, Link2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/renderer/components/Dialog';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { useAniListSearch, useRemoveAniListLink, useSetAniListLink } from '@/renderer/hooks/useQueries';

interface AniListLinkDialogProps {
  open: boolean;
  onClose: () => void;
  providerId: string;
  slug: string;
  defaultQuery: string;
  isManualLink: boolean;
}

export function AniListLinkDialog({
  open,
  onClose,
  providerId,
  slug,
  defaultQuery,
  isManualLink,
}: AniListLinkDialogProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [submitted, setSubmitted] = useState(defaultQuery);
  const { data: results, isFetching, isError } = useAniListSearch(submitted, open);
  const setLink = useSetAniListLink();
  const removeLink = useRemoveAniListLink();
  const lastToastedQueryRef = useRef('');

  useEffect(() => {
    const text = submitted.trim();
    if (!open || !text || !results || results.length > 0) return;
    if (lastToastedQueryRef.current === text) return;
    lastToastedQueryRef.current = text;
    toast.error('No se encontraron resultados para: ' + text);
  }, [open, results, submitted]);

  const hasSearched = submitted.trim().length >= 3 && (results !== undefined || isError);

  useEffect(() => {
    if (open) {
      setQuery(defaultQuery);
      setSubmitted(defaultQuery);
    }
  }, [open, defaultQuery]);

  const executeSearch = () => {
    const text = query.trim();
    if (text.length >= 3) setSubmitted(text);
  };

  const handleSelect = async (anilistId: number) => {
    try {
      await setLink.mutateAsync({ providerId, slug, anilistId });
      toast.success('Vínculo de AniList guardado');
      onClose();
    } catch {
      toast.error('No se pudo guardar el vínculo de AniList');
    }
  };

  const handleRemove = async () => {
    try {
      await removeLink.mutateAsync({ providerId, slug });
      toast.success('Vínculo de AniList eliminado');
      onClose();
    } catch {
      toast.error('No se pudo eliminar el vínculo de AniList');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Vincular con AniList"
      message={defaultQuery}
      icon={<Link2 className="h-5 w-5 text-primary" aria-hidden="true" />}
      showFooter={false}
      className="max-w-2xl"
    >
      <div className="flex gap-3 mb-4 -mt-1">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            aria-label="Buscar entrada de AniList"
            placeholder="Buscar en AniList por nombre..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
            className="search-input h-10 w-full rounded-lg border border-border bg-surface py-0 pl-9 pr-4 text-sm focus:outline-none transition-[border-color,box-shadow] hover:border-border-strong"
          />
        </div>
        <button
          type="button"
          onClick={executeSearch}
          disabled={isFetching}
          aria-busy={isFetching}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] disabled:opacity-50"
        >
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {isManualLink && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/40 px-3 py-2"
          role="note"
        >
          <p className="text-[13px] text-muted-foreground">Vínculo manual activo para este anime.</p>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removeLink.isPending}
            className="shrink-0 rounded-md border border-border/50 bg-secondary/50 px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-secondary hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            Quitar vínculo
          </button>
        </div>
      )}

      <div className="max-h-[48vh] overflow-y-auto custom-scrollbar px-1">
        {isFetching ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-muted-foreground"
            role="status"
            aria-label="Buscando en AniList"
          >
            <Loader2 className="w-8 h-8 animate-spin mb-4" aria-hidden="true" />
            <p className="text-sm">Buscando coincidencias...</p>
          </div>
        ) : results && results.length > 0 ? (
          <div className="grid grid-cols-1 gap-2">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Vincular ${item.romaji || item.english || 'entrada sin título'}`}
                disabled={setLink.isPending}
                className="group flex w-full items-center gap-4 rounded-lg p-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
                onClick={() => handleSelect(item.id)}
              >
                <PosterImage
                  src={item.cover}
                  alt={item.romaji || item.english || 'Entrada de AniList'}
                  className="h-24 w-16 shrink-0 rounded-lg bg-secondary object-cover sm:h-30 sm:w-20"
                />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <h4 className="line-clamp-2 break-words text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                      {item.romaji || item.english || 'Sin título'}
                    </h4>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                      <span className="shrink-0 font-bold uppercase">{item.format || 'TV'}</span>
                      {item.startYear && (
                        <>
                          <span aria-hidden="true" className="shrink-0 text-border-strong">
                            |
                          </span>
                          <span className="shrink-0 tabular-nums">{item.startYear}</span>
                        </>
                      )}
                    </div>
                    {item.english && item.romaji && (
                      <p className="mt-1 line-clamp-2 break-words text-[13px] leading-snug text-muted-foreground">
                        {item.english}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-primary transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
                    Vincular
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Link className="w-10 h-10 mb-4 opacity-20" aria-hidden="true" />
            <p className="text-sm text-center">
              {isError
                ? 'No se pudo completar la búsqueda. Inténtalo de nuevo.'
                : hasSearched
                  ? `No hay entradas de AniList para «${submitted.trim()}». Prueba con otro nombre.`
                  : 'Realiza una búsqueda para encontrar la entrada de AniList correcta.'}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

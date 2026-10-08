import { useEffect, useRef, useState } from 'react';
import { Link, Loader2, Search } from 'lucide-react';
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
            className="search-input w-full bg-background border border-border rounded-lg py-2.5 pl-9 pr-4 text-sm focus:outline-none transition-[border-color,box-shadow] hover:border-border-strong"
          />
        </div>
        <button
          type="button"
          onClick={executeSearch}
          disabled={isFetching}
          aria-busy={isFetching}
          className="px-6 py-2.5 bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] disabled:opacity-50 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
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

      <div className="overflow-y-auto max-h-[40vh] custom-scrollbar border border-border/30 rounded-lg bg-background/50 p-2">
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
                className="group flex w-full items-center gap-4 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-border/50 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
                onClick={() => handleSelect(item.id)}
              >
                <PosterImage
                  src={item.cover}
                  alt={item.romaji || item.english || 'Entrada de AniList'}
                  className="h-14 w-10 rounded bg-secondary object-cover shadow-sm"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm text-foreground truncate w-fit max-w-full group-hover:text-primary transition-colors">
                    {item.romaji || item.english || 'Sin título'}
                  </h4>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span className="uppercase font-bold">{item.format || 'TV'}</span>
                    <span aria-hidden="true" className="text-border-strong">
                      |
                    </span>
                    <span className="tabular-nums">{item.startYear || 'Desconocido'}</span>
                    {item.english && item.romaji && (
                      <>
                        <span aria-hidden="true" className="text-border-strong">
                          |
                        </span>
                        <span className="truncate">{item.english}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="px-4 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  VINCULAR
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Link className="w-10 h-10 mb-4 opacity-20" aria-hidden="true" />
            <p className="text-sm">
              {hasSearched
                ? `No hay entradas de AniList para «${submitted.trim()}». Prueba con otro nombre.`
                : 'Realiza una búsqueda para encontrar la entrada de AniList correcta.'}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

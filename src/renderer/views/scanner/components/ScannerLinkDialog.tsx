import { useState } from 'react';
import { useStore } from 'jotai';
import { activeProviderAtom } from '@/renderer/store/atoms';
import { Link2, Search } from 'lucide-react';
import type { LibraryFolder } from '@/services/library/LibraryFileService';
import type { AnimeSearchResult } from '@/types/anime';
import { Dialog } from '@/renderer/components/Dialog';
import { SearchField } from '@/renderer/components/ui/SearchField';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { LibraryMetadataDialog } from '@/renderer/components/anime/LibraryMetadataDialog';
import { AnimeMetadataLine } from '@/renderer/components/anime/AnimeMetadataLine';
import { useSearchAnime } from '@/renderer/hooks/useQueries';
import { isIpcFailError } from '@/renderer/hooks/queries/unwrap';
import { normalizeDisplayAnimeTitle } from '@/utils/titleUtils';

export function ScannerLinkDialog({
  folder,
  providerId,
  onClose,
  onApplied,
}: {
  folder: LibraryFolder;
  providerId: string;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const [query, setQuery] = useState(folder.metaTitle || folder.name);
  const [submitted, setSubmitted] = useState('');
  const [selected, setSelected] = useState<AnimeSearchResult | null>(null);
  const [review, setReview] = useState(false);
  const store = useStore();
  const showingSearch = submitted.length >= 3 && query.trim() === submitted;
  const search = useSearchAnime(submitted, showingSearch, providerId);
  const searching = showingSearch && search.isFetching;
  const alternatives = [
    ...new Set(
      [folder.metaTitle || normalizeDisplayAnimeTitle(folder.name), ...(folder.alternativeTitles ?? [])]
        .map((title) => title.trim())
        .filter(Boolean),
    ),
  ].filter((title) => title.toLowerCase() !== query.trim().toLowerCase());
  const execute = (text = query) => {
    if (searching) return;
    if (store.get(activeProviderAtom) !== providerId) return;
    const value = text.trim();
    if (value.length < 3) return;
    setQuery(value);
    setSelected(null);
    if (value === submitted) void search.refetch();
    else setSubmitted(value);
  };
  if (review && selected)
    return (
      <LibraryMetadataDialog
        requireActiveProvider
        request={{ folderPath: folder.path, providerId, slug: selected.slug }}
        onClose={() => setReview(false)}
        onApplied={() => {
          onApplied?.();
          onClose();
        }}
      />
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={folder.metaSlug ? 'Cambiar vínculo del proveedor' : 'Vincular anime a la carpeta'}
      message={`${folder.name} | ${providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1'}`}
      icon={<Link2 className="h-5 w-5" />}
      className="max-w-2xl"
      confirmLabel="Revisar vínculo"
      confirmDisabled={!selected || !showingSearch || searching || search.isError}
      closeOnConfirm={false}
      onConfirm={() => {
        if (selected && showingSearch && !searching && !search.isError && store.get(activeProviderAtom) === providerId)
          setReview(true);
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        const input = (event.currentTarget as HTMLElement).querySelector('input');
        input?.focus({ preventScroll: true });
        input?.setSelectionRange(input.value.length, input.value.length);
      }}
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          execute();
        }}
      >
        <SearchField
          className="min-w-0 flex-1"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setSelected(null);
          }}
          onClear={() => {
            setQuery('');
            setSelected(null);
          }}
          onSubmit={() => execute()}
          placeholder="Título o URL de la ficha…"
          ariaLabel="Buscar anime para vincular"
        />
        <button
          type="submit"
          disabled={searching || query.trim().length < 3}
          aria-busy={searching}
          className="min-h-11 shrink-0 rounded-lg bg-secondary px-4 text-sm font-medium disabled:opacity-50"
        >
          <Search className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Buscar
        </button>
      </form>
      {alternatives.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">Buscar por otro título</p>
          <div className="flex flex-wrap gap-2">
            {alternatives.map((title) => (
              <button
                key={title}
                type="button"
                disabled={searching}
                onClick={() => execute(title)}
                className="min-h-11 max-w-full rounded-lg border border-border-strong px-3 py-2 text-left text-[13px] text-foreground hover:bg-secondary wrap-anywhere"
              >
                {title}
              </button>
            ))}
          </div>
        </div>
      )}
      {folder.metaSlug && (
        <p className="mt-4 text-[13px] text-muted-foreground wrap-anywhere">
          Vínculo actual: <span className="text-foreground">{folder.metaTitle || folder.metaSlug}</span>
        </p>
      )}
      <div className="mt-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
        {searching ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            Buscando en el proveedor…
          </p>
        ) : showingSearch && search.isError ? (
          <p role="alert" className="py-4 text-sm text-destructive-fg">
            {isIpcFailError(search.error) && search.error.code === 'SEARCH_INVALID_URL'
              ? search.error.message
              : 'No se pudo consultar el proveedor. Pulsa Buscar para reintentar.'}
          </p>
        ) : showingSearch && search.data?.length ? (
          <div className="space-y-2">
            {(search.data as AnimeSearchResult[]).map((item) => (
              <button
                type="button"
                key={item.slug}
                aria-label={`Seleccionar ${item.title}`}
                aria-pressed={selected?.slug === item.slug}
                onClick={() => setSelected(item)}
                className={`flex min-h-28 w-full items-start gap-4 rounded-lg p-3 text-left transition-colors ${selected?.slug === item.slug ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
              >
                <PosterImage
                  src={item.poster}
                  alt={item.title}
                  className="h-24 w-16 sm:h-30 sm:w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 py-1">
                  <h3 className="line-clamp-2 break-words text-base font-semibold text-foreground">{item.title}</h3>
                  <div className="mt-2">
                    <AnimeMetadataLine values={[item.year, item.category, item.status]} />
                  </div>
                  {selected?.slug === item.slug && (
                    <p className="mt-2 text-xs font-medium text-primary">Seleccionada para revisar</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p role="status" className="py-4 text-sm text-muted-foreground wrap-anywhere">
            {showingSearch
              ? `No hay resultados para «${submitted}». Prueba otro nombre o pega la URL de la ficha.`
              : 'Busca por título o pega la URL de la ficha del proveedor.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}

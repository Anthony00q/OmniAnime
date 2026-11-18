import { useEffect, useRef, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/renderer/components/Dialog';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { LibraryMetadataDialog } from '@/renderer/components/anime/LibraryMetadataDialog';
import { AnimeMetadataLine } from '@/renderer/components/anime/AnimeMetadataLine';
import { AnimeBannerPreview } from '@/renderer/components/anime/AnimeBannerPreview';
import { SearchField } from '@/renderer/components/ui/SearchField';
import {
  useAniListSearch,
  useRemoveAniListLink,
  useSetAniListLink,
  useLibrary,
  useLoadSettings,
  useAniListId,
  useAniListLinkSource,
  AniListTransientError,
  type AniListSearchItem,
} from '@/renderer/hooks/useQueries';
import type { LibraryMetadataRequest } from '@/types/library';
import type { LibraryFolder } from '@/services/library/LibraryFileService';

interface AniListLinkDialogProps {
  open: boolean;
  onClose: () => void;
  providerId: string;
  slug: string;
  defaultQuery: string;
  isManualLink?: boolean;
  currentId?: number | null;
  onLinked?: () => void;
}

export function AniListLinkDialog({
  open,
  onClose,
  providerId,
  slug,
  defaultQuery,
  isManualLink,
  currentId,
  onLinked,
}: AniListLinkDialogProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [submitted, setSubmitted] = useState(defaultQuery);
  const [selected, setSelected] = useState<AniListSearchItem | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState<LibraryMetadataRequest | null>(null);
  const alive = useRef(false);
  const generation = useRef(0);
  const validQuery = query.trim().length >= 3 || /^\d+$/.test(query.trim());
  const showingSearch = validQuery && query.trim() === submitted.trim();
  const search = useAniListSearch(submitted, open && !saved && showingSearch);
  const results = showingSearch ? search.data : undefined;
  const isFetching = showingSearch && search.isFetching;
  const isError = showingSearch && search.isError;
  const setLink = useSetAniListLink();
  const removeLink = useRemoveAniListLink();
  const linkRequest = { title: defaultQuery, providerId, slug, persistMatch: false };
  const resolveLink = open && isManualLink === undefined;
  const knownId = useAniListId(linkRequest, resolveLink);
  const knownSource = useAniListLinkSource(linkRequest, resolveLink);
  const linkError = knownSource.error instanceof AniListTransientError ? knownSource.error : null;
  const effectiveId = resolveLink ? (knownId.data ?? linkError?.anilistId ?? currentId) : currentId;
  const manualLink = isManualLink ?? (knownSource.data ?? linkError?.linkSource) === 'manual';
  const settings = useLoadSettings();
  const dirs =
    open && saved
      ? (settings.data?.outputDirs ?? (settings.data?.defaultOutputDir ? [settings.data.defaultOutputDir] : []))
      : [];
  const library = useLibrary(dirs);
  const related = ((library.data ?? []) as LibraryFolder[]).filter(
    (folder) => folder.providerId === providerId && folder.metaSlug === slug,
  );
  const busy = setLink.isPending || removeLink.isPending;
  useEffect(() => {
    alive.current = open;
    const version = ++generation.current;
    if (open) {
      setQuery(defaultQuery);
      setSubmitted(defaultQuery);
      setSelected(null);
      setSaved(false);
      setError('');
      setRefresh(null);
    }
    return () => {
      alive.current = false;
      generation.current = version + 1;
    };
  }, [open, providerId, slug, defaultQuery]);
  const executeSearch = () => {
    if (isFetching || busy) return;
    const text = query.trim();
    if (text.length < 3 && !/^\d+$/.test(text)) return;
    setSelected(null);
    setError('');
    if (text === submitted.trim()) void search.refetch();
    else setSubmitted(text);
  };
  const save = async () => {
    if (!selected || !showingSearch || isFetching || isError || busy) return;
    setError('');
    const version = generation.current;
    try {
      await setLink.mutateAsync({ providerId, slug, anilistId: selected.id });
      if (!alive.current || version !== generation.current) return;
      toast.success('Vínculo de AniList guardado');
      setSaved(true);
      onLinked?.();
    } catch (failure) {
      if (alive.current && version === generation.current)
        setError(failure instanceof Error ? failure.message : 'No se pudo guardar el vínculo.');
    }
  };
  const remove = async () => {
    if (busy) return;
    const version = generation.current;
    try {
      await removeLink.mutateAsync({ providerId, slug });
      if (!alive.current || version !== generation.current) return;
      toast.success('Se utilizará la detección automática');
      onLinked?.();
      onClose();
    } catch (failure) {
      if (alive.current && version === generation.current)
        setError(failure instanceof Error ? failure.message : 'No se pudo cambiar el vínculo.');
    }
  };
  if (refresh) return <LibraryMetadataDialog request={refresh} onClose={() => setRefresh(null)} />;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={saved ? 'Vínculo de AniList guardado' : 'Vincular con AniList'}
      message={defaultQuery}
      icon={<Link2 className="h-5 w-5" />}
      className="max-w-2xl"
      showFooter={!saved}
      confirmLabel={busy ? 'Guardando…' : 'Guardar vínculo'}
      confirmLoading={busy}
      confirmDisabled={!selected || !showingSearch || isFetching || isError}
      closeOnConfirm={false}
      dismissDisabled={busy}
      onConfirm={save}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        const input = (event.currentTarget as HTMLElement).querySelector('input');
        input?.focus({ preventScroll: true });
        input?.setSelectionRange(input.value.length, input.value.length);
      }}
    >
      {saved ? (
        <div className="space-y-4">
          <p className="text-sm">El banner, el estudio y los títulos de esta ficha usan la entrada elegida.</p>
          <p className="text-[13px] text-muted-foreground">
            Puedes actualizar también sus carpetas locales. No se renombrarán ni se modificarán los vídeos.
          </p>
          {library.isFetching ? (
            <p role="status" className="text-sm text-muted-foreground">
              Buscando carpetas asociadas…
            </p>
          ) : library.isError ? (
            <p role="alert" className="text-sm text-destructive-fg">
              No se pudo leer la librería. Puedes actualizarla desde Escáner.
            </p>
          ) : related.length ? (
            <ul className="divide-y divide-border/40">
              {related.map((folder) => (
                <li key={folder.path} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{folder.name}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{folder.sourceDir}</p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg bg-secondary px-4 text-[13px] font-medium"
                    onClick={() => setRefresh({ folderPath: folder.path, providerId, slug, refresh: true })}
                  >
                    Revisar actualización
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No hay carpetas asociadas a esta ficha en las ubicaciones configuradas.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              className="min-h-11 min-w-24 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <>
          {(effectiveId || manualLink) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/30 px-3 py-2">
              <p className="text-[13px] text-muted-foreground">
                {effectiveId ? `Vínculo actual: AniList #${effectiveId}` : 'Vínculo manual activo'}
              </p>
              {manualLink && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="min-h-11 rounded-lg px-3 text-xs font-medium hover:bg-secondary"
                >
                  Volver al automático
                </button>
              )}
            </div>
          )}
          <form
            className="mb-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              executeSearch();
            }}
          >
            <SearchField
              className="min-w-0 flex-1"
              value={query}
              onChange={(value) => {
                setQuery(value);
                setSelected(null);
                setError('');
              }}
              onClear={() => {
                setQuery('');
                setSelected(null);
                setError('');
              }}
              onSubmit={executeSearch}
              placeholder="Título, URL o ID de AniList…"
              ariaLabel="Buscar entrada de AniList"
            />
            <button
              type="submit"
              disabled={!validQuery || isFetching || busy}
              aria-busy={isFetching}
              className="min-h-11 shrink-0 rounded-lg bg-secondary px-4 text-sm font-medium disabled:opacity-50"
            >
              <Search className="mr-2 inline h-4 w-4" aria-hidden="true" />
              Buscar
            </button>
          </form>
          <div className="max-h-[40vh] min-h-32 overflow-y-auto custom-scrollbar">
            {isFetching ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Buscando en AniList…
              </p>
            ) : isError ? (
              <p role="alert" className="py-6 text-sm text-destructive-fg">
                No se pudo consultar AniList. Pulsa Buscar para reintentar.
              </p>
            ) : results?.length ? (
              <div className="space-y-2">
                {results.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-label={`Seleccionar ${item.romaji || item.english || item.id}`}
                    aria-pressed={selected?.id === item.id}
                    disabled={busy}
                    onClick={() => setSelected(item)}
                    className={`flex w-full items-start gap-4 rounded-lg p-3 text-left transition-colors ${selected?.id === item.id ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                  >
                    <PosterImage
                      src={item.cover}
                      alt={item.romaji || item.english || 'Entrada de AniList'}
                      className="h-24 w-16 sm:h-30 sm:w-20 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 break-words text-base font-semibold text-foreground">
                        {item.romaji || item.english || 'Sin título'}
                      </h3>
                      {item.english && item.english !== item.romaji && (
                        <p className="mt-1 break-words text-[13px] text-muted-foreground">{item.english}</p>
                      )}
                      <div className="mt-2">
                        <AnimeMetadataLine values={[item.format, item.startYear, `#${item.id}`]} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                {showingSearch
                  ? `No hay entradas de AniList para «${submitted}». Prueba con otro nombre.`
                  : 'Realiza una búsqueda para encontrar la entrada de AniList correcta.'}
              </p>
            )}
          </div>
          {selected && !isFetching && (
            <div className="mt-4 space-y-2 rounded-xl bg-secondary/30 p-3">
              <p className="break-words text-[13px] font-medium">
                Entrada elegida: {selected.romaji || selected.english}
              </p>
              <AnimeBannerPreview src={selected.banner} title={selected.romaji || selected.english || 'Anime'} />
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive-fg">
          {error}
        </p>
      )}
    </Dialog>
  );
}

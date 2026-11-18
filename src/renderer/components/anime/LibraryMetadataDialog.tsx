import { useEffect, useRef, useState } from 'react';
import { useStore } from 'jotai';
import { activeProviderAtom } from '@/renderer/store/atoms';
import { Link2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/renderer/components/Dialog';
import { useApplyLibraryMetadata, useLibraryMetadataPreview } from '@/renderer/hooks/useQueries';
import type { LibraryMetadataRequest } from '@/types/library';
import { PosterImage } from './PosterImage';
import { AnimeMetadataLine } from './AnimeMetadataLine';
import { AnimeBannerPreview } from './AnimeBannerPreview';

export function LibraryMetadataDialog({
  request,
  onClose,
  onApplied,
  requireActiveProvider = false,
}: {
  request: LibraryMetadataRequest;
  onClose: () => void;
  onApplied?: () => void;
  requireActiveProvider?: boolean;
}) {
  const store = useStore();
  const alive = useRef(false);
  const generation = useRef(0);
  const scope = `${request.folderPath}:${request.providerId}:${request.slug}`;
  useEffect(() => {
    alive.current = true;
    const version = ++generation.current;
    return () => {
      alive.current = false;
      generation.current = version + 1;
    };
  }, [scope]);
  const [session, setSession] = useState(0);
  const preview = useLibraryMetadataPreview(request, session);
  const apply = useApplyLibraryMetadata();
  const [error, setError] = useState('');
  const proposed = preview.data?.proposed;
  const current = preview.data?.current;
  const confirm = async () => {
    if (!preview.data || preview.isError || preview.isFetching || apply.isPending) return;
    if (requireActiveProvider && store.get(activeProviderAtom) !== request.providerId) return;
    setError('');
    const version = generation.current;
    try {
      const result = await apply.mutateAsync(preview.data.token);
      if (!alive.current || version !== generation.current) return;
      if (result.warnings.length)
        toast.warning('Metadatos guardados con incidencias', { description: result.warnings.join(' ') });
      else toast.success(request.refresh ? 'Metadatos actualizados' : 'Vínculo guardado');
      onApplied?.();
      onClose();
    } catch (failure) {
      if (!alive.current || version !== generation.current) return;
      setError(failure instanceof Error ? failure.message : 'No se pudo confirmar el cambio. Revisa la carpeta.');
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={request.refresh ? 'Actualizar metadatos' : 'Revisar vínculo'}
      message="Revisa la ficha antes de guardar. Los vídeos y el nombre de la carpeta no cambian."
      icon={request.refresh ? <RefreshCw className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
      className="max-w-2xl"
      closeOnConfirm={false}
      dismissDisabled={apply.isPending}
      confirmLabel={apply.isPending ? 'Guardando…' : 'Guardar cambios'}
      confirmLoading={apply.isPending}
      confirmDisabled={!proposed || preview.isError || preview.isFetching || !!error}
      onConfirm={confirm}
    >
      <div className="min-h-40 space-y-4">
        {preview.isFetching ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            Consultando la ficha y AniList…
          </p>
        ) : preview.isError ? (
          <p role="alert" className="text-sm text-destructive-fg">
            {preview.error.message}
          </p>
        ) : (
          proposed && (
            <>
              <div className="flex items-start gap-4">
                <PosterImage
                  src={proposed.posterUrl}
                  alt={proposed.title ?? 'Carátula'}
                  className="h-36 w-24 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 space-y-2">
                  <h3 className="break-words text-base font-semibold">{proposed.title}</h3>
                  <AnimeMetadataLine
                    values={[
                      request.providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1',
                      proposed.year,
                      proposed.category,
                      proposed.lang,
                    ]}
                  />
                  {proposed.secondaryTitle && (
                    <p className="break-words text-[13px] text-muted-foreground">{proposed.secondaryTitle}</p>
                  )}
                  <p className="text-[13px] text-muted-foreground">
                    {proposed.anilistId
                      ? `AniList #${proposed.anilistId}`
                      : preview.data?.warnings.length
                        ? 'Vínculo de AniList sin confirmar'
                        : 'Sin coincidencia en AniList'}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 rounded-xl bg-secondary/30 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Vínculo actual</p>
                  <p className="mt-1 break-words text-sm">{current?.title || 'Sin asignar'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ficha elegida</p>
                  <p className="mt-1 break-words text-sm font-medium">{proposed.title}</p>
                </div>
              </div>
              <AnimeBannerPreview src={proposed.bannerUrl} title={proposed.title ?? 'Anime'} />
              {preview.data?.warnings.map((warning) => (
                <p key={warning} role="note" className="text-[13px] text-warning">
                  {warning}
                </p>
              ))}
            </>
          )
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-fg">
            {error}
          </p>
        )}
        {(preview.isError || error) && (
          <button
            type="button"
            disabled={apply.isPending || preview.isFetching}
            className="min-h-11 rounded-lg bg-secondary px-4 text-[13px] font-medium"
            onClick={() => {
              setError('');
              setSession((value) => value + 1);
            }}
          >
            Preparar otra revisión
          </button>
        )}
      </div>
    </Dialog>
  );
}

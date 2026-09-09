import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ArrowLeft, FolderOpen, Settings, Wand2, ListOrdered, Info, FileText, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '../components/Dialog';
import {
  useEpisodes,
  useLoadSettings,
  useLibraryActions,
  usePreviewRename,
  usePreviewReorder,
} from '../hooks/useQueries';
import { PosterImage } from '../components/anime/PosterImage';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { EpisodeListSkeleton } from '../components/anime/PosterGridSkeleton';
import { EpisodeRow, type EpisodeDensity } from './libraryDetails/components/EpisodeRow';
import { LibraryHero } from './libraryDetails/components/LibraryHero';
import { RenameDialog } from './libraryDetails/components/RenameDialog';
import { ReorderDialog } from './libraryDetails/components/ReorderDialog';

interface LibraryAnimeDetailsProps {
  folderData: any;
  onBack: () => void;
  onSelectAnime?: (slug: string) => void;
  activeProvider?: string;
  isActive?: boolean;
}

export function LibraryAnimeDetails({
  folderData,
  onBack,
  onSelectAnime,
  activeProvider,
  isActive,
}: LibraryAnimeDetailsProps) {
  const { data: episodes = [], isLoading, isError, refetch } = useEpisodes(folderData.path);
  const { data: settings } = useLoadSettings();
  const libActions = useLibraryActions();

  const [showMenu, setShowMenu] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameStyle, setRenameStyle] = useState<'minimal' | 'descriptive'>('descriptive');
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  // Preferencia solo-renderer: no toca settings/DB ni validación de esquema.
  const [episodeDensity, setEpisodeDensity] = useState<EpisodeDensity>(() => {
    try {
      return window.localStorage.getItem('omnianime:episode-density') === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  const handleDensityChange = useCallback((density: EpisodeDensity) => {
    setEpisodeDensity(density);
    try {
      window.localStorage.setItem('omnianime:episode-density', density);
    } catch {}
  }, []);

  // Velo superior de la lista: aparece solo con scroll (centinela + observer,
  // sin handlers de scroll). El margen superior negativo evita el corte seco.
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listTopSentinelRef = useRef<HTMLDivElement | null>(null);
  const [isListScrolled, setIsListScrolled] = useState(false);

  useEffect(() => {
    const root = listScrollRef.current;
    const sentinel = listTopSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        setIsListScrolled(!entries[0].isIntersecting);
      },
      { root, threshold: 0, rootMargin: '-8px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isLoading, isError, episodes.length]);
  const [reorderStart, setReorderStart] = useState('1');
  const [debouncedReorderStart, setDebouncedReorderStart] = useState('1');
  // thumbEpoch: re-pide miniaturas tras renombrar/renumerar.
  const [thumbEpoch, setThumbEpoch] = useState(0);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (isActive === false) {
      setShowMenu(false);
      setShowRenameModal(false);
      setShowReorderModal(false);
      setDeleteConfirmPath(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (settings?.namingStyle && !showRenameModal) {
      setRenameStyle(settings.namingStyle === 'minimal' ? 'minimal' : 'descriptive');
    }
  }, [settings?.namingStyle, showRenameModal]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedReorderStart(reorderStart), 180);
    return () => clearTimeout(t);
  }, [reorderStart]);

  const autoRename = settings?.autoRenameRetroactive === true;
  const globalStyle: 'minimal' | 'descriptive' = settings?.namingStyle === 'minimal' ? 'minimal' : 'descriptive';

  const renamePreviewEnabled = showRenameModal && !!folderData.path;
  const {
    data: renamePreview,
    isFetching: isRenamePreviewFetching,
    isError: isRenamePreviewError,
  } = usePreviewRename(folderData.path, renameStyle, renamePreviewEnabled);

  const reorderStartNum = useMemo(() => {
    const n = parseInt(debouncedReorderStart, 10);
    return isNaN(n) ? NaN : n;
  }, [debouncedReorderStart]);
  const isReorderInputPending = reorderStart !== debouncedReorderStart;
  const reorderPreviewEnabled = showReorderModal && Number.isFinite(reorderStartNum) && reorderStartNum >= 0;
  const { data: reorderPreview, isFetching: isReorderPreviewFetching } = usePreviewReorder(
    folderData.path,
    Number.isFinite(reorderStartNum) ? reorderStartNum : 1,
    reorderPreviewEnabled,
  );

  useEffect(() => {
    const handleClose = (e: Event) => {
      if (!isActiveRef.current) return;
      e.preventDefault();
      if (showRenameModal) setShowRenameModal(false);
      else if (showReorderModal) setShowReorderModal(false);
      else if (showMenu) setShowMenu(false);
      else onBack();
    };
    window.addEventListener('close-modals', handleClose);
    return () => window.removeEventListener('close-modals', handleClose);
  }, [onBack, showRenameModal, showReorderModal, showMenu]);

  const handlePlay = useCallback(
    (videoPath: string) => {
      libActions.playVideo.mutate(videoPath, {
        onError: (error) => toast.error(error.message || 'No se pudo reproducir el archivo'),
      });
    },
    [libActions.playVideo],
  );

  const handleDelete = useCallback((videoPath: string) => {
    setDeleteConfirmPath(videoPath);
  }, []);

  const handleOpenFolder = useCallback(() => {
    libActions.openFolder.mutate(folderData.path, {
      onError: (error) => toast.error(error.message || 'No se pudo abrir la carpeta'),
    });
  }, [libActions.openFolder, folderData.path]);

  const submitRename = () => {
    const summary = renamePreview?.summary;
    if (renamePreview && summary && summary.toRename === 0) {
      if (summary.conflicts > 0) toast.info('No hay cambios sin conflicto disponible');
      else if (summary.alreadyCorrect === summary.total && summary.total > 0)
        toast.info('Todos los archivos ya están con el estilo seleccionado');
      else toast.info('No hay archivos que renombrar');
      return;
    }
    setShowRenameModal(false);
    libActions.renameFiles.mutate(
      { animePath: folderData.path, style: renameStyle },
      {
        onSuccess: (res: any) => {
          const renamed = typeof res === 'object' && res && 'renamed' in res ? res.renamed : null;
          const conflicts = typeof res === 'object' && res && 'skippedConflicts' in res ? res.skippedConflicts : 0;
          if (res && (res.success === true || res === true)) {
            if (renamed === 0) {
              if (conflicts > 0) toast.info(`Sin cambios — ${conflicts} conflicto(s) evitado(s)`);
              else toast.info('No fue necesario renombrar archivos');
            } else if (renamed !== null) {
              toast.success(
                `${renamed} archivo(s) renombrado(s) a ${renameStyle === 'minimal' ? 'Minimalista' : 'Descriptivo'}` +
                  (conflicts ? ` · ${conflicts} conflicto(s) ignorado(s)` : ''),
              );
            } else {
              toast.success(`Archivos renombrados a estilo ${renameStyle}`);
            }
            setThumbEpoch((v) => v + 1);
            refetch();
          } else {
            toast.error(res?.error || 'Error al renombrar archivos');
          }
        },
        onError: (e: any) => toast.error(e?.message || 'Error al comunicarse con el sistema'),
      },
    );
  };

  const submitReorder = () => {
    const startNum = parseInt(reorderStart, 10);
    if (isNaN(startNum) || startNum < 0) return toast.error('Número inválido — usa 0 o mayor');
    const summary = reorderPreview?.summary;
    if (reorderPreview && summary && summary.toRename === 0) {
      toast.info('Todos los archivos ya están en esa numeración');
      return;
    }
    setShowReorderModal(false);
    libActions.reorderEpisodes.mutate(
      { folderPath: folderData.path, startNumber: startNum },
      {
        onSuccess: (res) => {
          if (res && res.success) {
            toast.success(`Episodios renumerados — ${res.renamed} archivo(s) desde EP_${startNum}`);
            setThumbEpoch((v) => v + 1);
            refetch();
          } else {
            toast.error(res?.error || 'Error al renumerar episodios');
          }
        },
        onError: () => toast.error('Error al comunicarse con el sistema'),
      },
    );
  };

  const title = folderData.metaTitle || folderData.name;
  const bannerSrc = folderData.bannerLocal || folderData.posterLocal;
  const episodeCountLabel = episodes.length === 1 ? '1 episodio' : `${episodes.length} episodios`;

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 w-full h-[40vh] z-0 overflow-hidden">
        {bannerSrc && (
          <PosterImage
            src={bannerSrc}
            alt={`Banner de ${title}`}
            fallbackLabel={title}
            className="h-full w-full scale-105 object-cover opacity-10 blur-[2px]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background"></div>
      </div>

      <div className="relative z-10 flex h-full min-w-0 flex-col">
        <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
          <button
            type="button"
            onClick={onBack}
            className="group flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-200 hover:bg-black/65 hover:border-white/20 hover:shadow-lg hover:shadow-black/20 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:px-4"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> Volver a
            Librería
          </button>
          <div className="relative ml-auto max-w-full">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenFolder}
                className="group flex items-center gap-2 rounded-full border border-border bg-secondary/80 px-3 py-2 text-sm font-medium text-foreground backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-200 hover:bg-secondary hover:border-border-strong hover:shadow-md hover:shadow-black/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:px-4"
              >
                <FolderOpen className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" /> Abrir
                Directorio
              </button>

              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                aria-label="Abrir gestión de archivos"
                aria-expanded={showMenu}
                className="group flex items-center justify-center rounded-full border border-border bg-secondary/80 p-2 text-foreground backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-200 hover:bg-secondary hover:border-border-strong hover:shadow-md hover:shadow-black/10 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Settings className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              </button>
            </div>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40 disable-shortcuts" onClick={() => setShowMenu(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-[300px] bg-popover border border-border/70 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-3 border-b border-border/50 bg-secondary/20">
                    <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Wand2 className="w-3.5 h-3.5" /> Gestión de Archivos
                    </span>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {episodeCountLabel} en esta carpeta · Cambios solo aquí, no mueven otras carpetas.
                    </p>
                  </div>

                  <div className="p-1.5">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowRenameModal(true);
                      }}
                      className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-secondary transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                        <FileText className="w-4 h-4 text-primary" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                          Forzar renombrado de archivos
                          {autoRename && (
                            <span className="text-[11px] font-bold tracking-widest uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                              Auto activo
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground leading-relaxed block mt-0.5">
                          Aplica estilo Minimalista o Descriptivo a todos. Respeta Ajustes como base, pero fuerza aquí.
                        </span>
                        <span className="text-[11px] font-mono bg-secondary border border-border/60 rounded-md px-1.5 py-0.5 mt-1.5 inline-flex">
                          {globalStyle === 'minimal' ? 'Global: EP_01.mp4' : `Global: Título EP_01.mp4`}
                        </span>
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowReorderModal(true);
                      }}
                      className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-secondary transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 mt-1"
                    >
                      <span className="w-9 h-9 rounded-xl bg-secondary border border-border/60 flex items-center justify-center shrink-0 group-hover:bg-secondary/80 transition-colors">
                        <ListOrdered className="w-4 h-4 text-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-foreground">Renumerar episodios</span>
                        <span className="text-xs text-muted-foreground leading-relaxed block mt-0.5">
                          Desplaza la numeración (ej. EP_13 para S02). Conserva el estilo actual detectado.
                        </span>
                        <span className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                          <Hash className="w-3 h-3" /> Inicio sugerido: 1 · 13 · 25
                        </span>
                      </span>
                    </button>
                  </div>

                  <div className="px-3 py-2 border-t border-border/50 bg-secondary/10 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>Vista previa antes de aplicar. Los conflictos por nombre se omiten.</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <LibraryHero
          title={title}
          bannerSrc={null}
          posterLocal={folderData.posterLocal}
          episodeCount={episodes.length}
          metaSlug={folderData.metaSlug}
          providerId={folderData.providerId}
          activeProvider={activeProvider}
          onSelectAnime={onSelectAnime}
        />

        <div
          ref={listScrollRef}
          className="min-w-0 flex-1 overflow-y-auto border-t border-border/50 bg-background/95 px-4 py-4 backdrop-blur-md sm:px-8 sm:py-6 md:px-10"
        >
          {isLoading ? (
            <EpisodeListSkeleton count={6} />
          ) : isError ? (
            <ErrorState
              title="No se pudieron cargar los episodios"
              description="No pudimos leer los archivos de esta carpeta."
              onRetry={() => refetch()}
            />
          ) : episodes.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-10 w-10" aria-hidden="true" />}
              title="No hay episodios en esta carpeta"
              description="Esta carpeta no contiene vídeos reproducibles. Verifica que los archivos se descargaron correctamente."
              className="h-auto py-12"
            />
          ) : (
            <div>
              <div ref={listTopSentinelRef} aria-hidden="true" className="h-px w-full" />
              <div
                aria-hidden="true"
                className={`pointer-events-none sticky -top-4 z-10 -mx-4 -mt-12 h-12 bg-gradient-to-b from-background via-background/60 to-transparent transition-opacity duration-200 sm:-top-6 sm:-mx-8 md:-mx-10 ${
                  isListScrolled ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <div className="mb-3 flex items-center justify-end">
                <div
                  role="group"
                  aria-label="Densidad de la lista de episodios"
                  className="flex items-center gap-1 rounded-full border border-border/70 bg-surface p-1"
                >
                  {(
                    [
                      { value: 'comfortable', label: 'Cómoda' },
                      { value: 'compact', label: 'Compacta' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleDensityChange(option.value)}
                      aria-pressed={episodeDensity === option.value}
                      className={`h-7 shrink-0 rounded-full px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                        episodeDensity === option.value
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={episodeDensity === 'compact' ? 'grid gap-3 xl:grid-cols-2' : 'space-y-3'}>
                {episodes.map((ep: any, i: number) => (
                  <EpisodeRow
                    key={ep.path || i}
                    ep={ep}
                    onPlay={handlePlay}
                    onDelete={handleDelete}
                    density={episodeDensity}
                    thumbToken={thumbEpoch}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <RenameDialog
        open={showRenameModal}
        onOpenChange={setShowRenameModal}
        title={title}
        folderName={folderData.name}
        renameStyle={renameStyle}
        onStyleChange={setRenameStyle}
        autoRename={autoRename}
        globalStyle={globalStyle}
        renamePreview={renamePreview}
        isFetching={isRenamePreviewFetching}
        isError={isRenamePreviewError}
        isPending={libActions.renameFiles.isPending}
        onConfirm={submitRename}
      />

      <ReorderDialog
        open={showReorderModal}
        onOpenChange={setShowReorderModal}
        reorderStart={reorderStart}
        onReorderStartChange={setReorderStart}
        reorderStartNum={reorderStartNum}
        isInputPending={isReorderInputPending}
        reorderPreview={reorderPreview}
        isFetching={isReorderPreviewFetching}
        isPending={libActions.reorderEpisodes.isPending}
        onConfirm={submitReorder}
      />

      <Dialog
        open={deleteConfirmPath !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmPath(null);
        }}
        title="Eliminar episodio"
        message="¿Estás seguro de que deseas eliminar este episodio de forma permanente?"
        confirmLabel="Eliminar"
        danger={true}
        onConfirm={() => {
          if (deleteConfirmPath) {
            libActions.deleteVideo.mutate(deleteConfirmPath, {
              onError: (error) => toast.error(error.message || 'No se pudo eliminar el episodio'),
            });
            setDeleteConfirmPath(null);
          }
        }}
      />
    </div>
  );
}

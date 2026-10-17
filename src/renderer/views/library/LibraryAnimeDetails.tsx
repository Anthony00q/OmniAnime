import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { HERO_DIM_MAX, HERO_DIM_DISTANCE, createHeroDimController } from '@/renderer/utils/heroDim';
import { useReducedMotion } from '@/renderer/utils/motion';
import { ArrowLeft, FolderOpen, Settings, Wand2, ListOrdered, Info, FileText, Hash, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { isIpcFailError } from '@/renderer/hooks/queries/unwrap';
import { Dialog } from '@/renderer/components/Dialog';
import {
  useEpisodes,
  useLoadSettings,
  useLibraryActions,
  usePreviewRename,
  usePreviewReorder,
} from '@/renderer/hooks/useQueries';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { EpisodeListSkeleton } from '@/renderer/components/anime/PosterGridSkeleton';
import { EpisodeRow } from './components/EpisodeRow';
import { LibraryHero, LibraryHeroBanner } from './components/LibraryHero';
import { LibraryFolderMenu } from './components/LibraryFolderMenu';
import { LibraryFolderDetailsDialog } from './components/LibraryFolderDetailsDialog';
import { LibraryEpisodeDetailsDialog } from './components/LibraryEpisodeDetailsDialog';
import { RenameDialog } from './components/RenameDialog';
import { ReorderDialog } from './components/ReorderDialog';
import { RenameFolderDialog } from './components/RenameFolderDialog';

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
  const [showFolderRename, setShowFolderRename] = useState(false);
  const [heroMenu, setHeroMenu] = useState<{ x: number; y: number } | null>(null);
  const [showFolderDetails, setShowFolderDetails] = useState(false);
  const [episodeMenu, setEpisodeMenu] = useState<{
    x: number;
    y: number;
    path: string;
    folderPath: string;
  } | null>(null);
  const [episodeDetails, setEpisodeDetails] = useState<{ path: string; folderPath: string } | null>(null);
  const episodeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeEpisodeMenu = useCallback(() => setEpisodeMenu(null), []);
  const handleEpisodeContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement> | ReactKeyboardEvent<HTMLButtonElement>, path: string) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      target.focus({ preventScroll: true });
      episodeTriggerRef.current = target;
      const bounds = target.getBoundingClientRect();
      const pointer = 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0);
      setHeroMenu(null);
      setShowMenu(false);
      setEpisodeMenu({
        x: pointer ? event.clientX : bounds.left,
        y: pointer ? event.clientY : bounds.bottom,
        path,
        folderPath: folderData.path,
      });
    },
    [folderData.path],
  );
  const handleEpisodeDetailsChange = useCallback((open: boolean) => {
    if (open) return;
    setEpisodeDetails(null);
    const trigger = episodeTriggerRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }, []);
  const selectedEpisode =
    episodeDetails && episodeDetails.folderPath === folderData.path
      ? (episodes.find((episode: any) => episode.path === episodeDetails.path) ?? null)
      : null;

  useEffect(() => {
    setEpisodeMenu(null);
    setEpisodeDetails(null);
  }, [folderData.path, isActive]);

  const handleHeroContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setHeroMenu({ x: event.clientX, y: event.clientY });
  }, []);
  const closeHeroMenu = useCallback(() => setHeroMenu(null), []);
  const [renameStyle, setRenameStyle] = useState<'minimal' | 'descriptive'>('descriptive');
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [listScrollNode, setListScrollNode] = useState<HTMLDivElement | null>(null);
  const [bannerFadeNode, setBannerFadeNode] = useState<HTMLDivElement | null>(null);
  const [heroNode, setHeroNode] = useState<HTMLDivElement | null>(null);
  const [heroBottom, setHeroBottom] = useState(0);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!heroNode) return;
    const measure = () => setHeroBottom(heroNode.offsetTop + heroNode.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(heroNode);
    const toolbarNode = toolbarRef.current;
    if (toolbarNode) observer.observe(toolbarNode);
    return () => observer.disconnect();
  }, [heroNode, folderData.path]);

  useEffect(() => {
    if (!listScrollNode || !bannerFadeNode) return;
    const controller = createHeroDimController(
      () => Math.min(1, Math.max(0, listScrollNode.scrollTop / HERO_DIM_DISTANCE)) * HERO_DIM_MAX,
      (opacity) => {
        bannerFadeNode.style.opacity = String(opacity);
      },
      reducedMotion,
    );
    const onScroll = controller.request;
    listScrollNode.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      listScrollNode.removeEventListener('scroll', onScroll);
      controller.dispose();
    };
  }, [listScrollNode, bannerFadeNode, folderData.path, reducedMotion]);
  const [reorderStart, setReorderStart] = useState('1');
  const [debouncedReorderStart, setDebouncedReorderStart] = useState('1');
  // thumbEpoch: re-pide miniaturas tras renombrar/renumerar.
  const [thumbEpoch, setThumbEpoch] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const mounted = useRef(true);
  const folderPathRef = useRef(folderData.path);
  folderPathRef.current = folderData.path;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (isActive === false) {
      setShowMenu(false);
      setShowRenameModal(false);
      setShowReorderModal(false);
      setShowFolderRename(false);
      setDeleteConfirmPath(null);
      setHeroMenu(null);
      setShowFolderDetails(false);
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

  const globalStyle: 'minimal' | 'descriptive' = settings?.namingStyle === 'minimal' ? 'minimal' : 'descriptive';

  const renamePreviewEnabled = showRenameModal && !!folderData.path;
  const {
    data: renamePreview,
    isFetching: isRenamePreviewFetching,
    isError: isRenamePreviewError,
  } = usePreviewRename(folderData.path, renameStyle, renamePreviewEnabled);

  const reorderStartNum = useMemo(() => {
    const n = debouncedReorderStart.trim() ? Number(debouncedReorderStart) : NaN;
    return Number.isSafeInteger(n) ? n : NaN;
  }, [debouncedReorderStart]);
  const isReorderInputPending = reorderStart !== debouncedReorderStart;
  const reorderPreviewEnabled = showReorderModal && Number.isFinite(reorderStartNum) && reorderStartNum >= 0;
  const {
    data: reorderPreview,
    isFetching: isReorderPreviewFetching,
    isError: isReorderPreviewError,
  } = usePreviewReorder(folderData.path, Number.isFinite(reorderStartNum) ? reorderStartNum : 1, reorderPreviewEnabled);

  useEffect(() => {
    const handleClose = (e: Event) => {
      if (!isActiveRef.current) return;
      e.preventDefault();
      if (episodeDetails) handleEpisodeDetailsChange(false);
      else if (showRenameModal) setShowRenameModal(false);
      else if (showReorderModal) setShowReorderModal(false);
      else if (showMenu) setShowMenu(false);
    };
    window.addEventListener('close-modals', handleClose);
    return () => window.removeEventListener('close-modals', handleClose);
  }, [showRenameModal, showReorderModal, showMenu, episodeDetails, handleEpisodeDetailsChange]);

  const handlePlay = useCallback(
    (videoPath: string) => {
      libActions.playVideo.mutate(videoPath, {
        onError: (error) => {
          if (!isIpcFailError(error)) toast.error(error.message || 'No se pudo reproducir el archivo');
        },
      });
    },
    [libActions.playVideo],
  );

  const handleDelete = useCallback((videoPath: string) => {
    setDeleteConfirmPath(videoPath);
  }, []);

  const handleOpenFolder = useCallback(() => {
    libActions.openFolder.mutate(folderData.path, {
      onError: (error) => {
        if (!isIpcFailError(error)) toast.error(error.message || 'No se pudo abrir la carpeta');
      },
    });
  }, [libActions.openFolder, folderData.path]);

  const submitRename = async () => {
    if (libActions.isMutating || isRenamePreviewFetching || !renamePreview?.success || !renamePreview.revision) return;
    const summary = renamePreview?.summary;
    if (renamePreview && summary && summary.toRename === 0) {
      if (summary.conflicts > 0) toast.info('No hay cambios sin conflicto disponible');
      else if (summary.alreadyCorrect === summary.total && summary.total > 0)
        toast.info('Todos los archivos ya están con el estilo seleccionado');
      else toast.info('No hay archivos que renombrar');
      return;
    }
    const origin = folderData.path;
    const style = renameStyle;
    setFileError(null);
    try {
      const res = await libActions.renameFiles.mutateAsync({
        animePath: origin,
        style,
        expectedRevision: renamePreview.revision,
      });
      if (!mounted.current || folderPathRef.current !== origin) return;
      const renamed = typeof res === 'object' && res && 'renamed' in res ? res.renamed : null;
      const conflicts = typeof res === 'object' && res && 'skippedConflicts' in res ? res.skippedConflicts : 0;
      if (res && (res.success === true || res === true)) {
        setThumbEpoch((v) => v + 1);
        if (res.failed > 0) {
          setFileError(
            `${renamed ?? 0} archivos renombrados; ${res.failed} no se pudieron renombrar. Revisa la vista previa.`,
          );
          return;
        }
        setShowRenameModal(false);
        if (renamed === 0) {
          if (conflicts > 0) toast.info(`Sin cambios — ${conflicts} conflicto(s) evitado(s)`);
          else toast.info('No fue necesario renombrar archivos');
        } else if (renamed !== null) {
          toast.success(
            `${renamed} archivo(s) renombrado(s) a ${style === 'minimal' ? 'Minimalista' : 'Descriptivo'}` +
              (conflicts ? ` · ${conflicts} conflicto(s) ignorado(s)` : ''),
          );
        } else {
          toast.success(`Archivos renombrados a estilo ${renameStyle}`);
        }
      } else {
        toast.error(res?.error || 'Error al renombrar archivos');
      }
    } catch (error) {
      if (!mounted.current || folderPathRef.current !== origin) return;
      setThumbEpoch((v) => v + 1);
      setFileError(error instanceof Error ? error.message : 'No se pudieron renombrar los archivos.');
    }
  };

  const submitReorder = async () => {
    const startNum = reorderStart.trim() ? Number(reorderStart) : NaN;
    if (!Number.isSafeInteger(startNum) || startNum < 0) return;
    if (
      libActions.isMutating ||
      isReorderInputPending ||
      isReorderPreviewFetching ||
      !reorderPreview?.success ||
      !reorderPreview.revision ||
      reorderPreview.startNumber !== startNum
    )
      return;
    const summary = reorderPreview?.summary;
    if (reorderPreview && summary && summary.toRename === 0) {
      toast.info('Todos los archivos ya están en esa numeración');
      return;
    }
    const origin = folderData.path;
    setFileError(null);
    try {
      const res = await libActions.reorderEpisodes.mutateAsync({
        folderPath: origin,
        startNumber: startNum,
        expectedRevision: reorderPreview.revision,
      });
      if (!mounted.current || folderPathRef.current !== origin) return;
      if (res && res.success) {
        toast.success(`Episodios renumerados — ${res.renamed} archivo(s) desde EP_${startNum}`);
        setThumbEpoch((v) => v + 1);
        setShowReorderModal(false);
      } else {
        toast.error(res?.error || 'Error al renumerar episodios');
      }
    } catch (error) {
      if (!mounted.current || folderPathRef.current !== origin) return;
      setThumbEpoch((v) => v + 1);
      setFileError(error instanceof Error ? error.message : 'No se pudieron renumerar los episodios.');
    }
  };

  const title = folderData.metaTitle || folderData.name;
  // Sin fallback al póster: sin banner local, el hero queda en plano,
  // igual que la ficha de Detalles.
  const bannerSrc = folderData.bannerLocal;
  const displayedEpisodeCount = isLoading ? Math.max(0, Number(folderData.episodeCount) || 0) : episodes.length;
  const episodeCountLabel = displayedEpisodeCount === 1 ? '1 episodio' : `${displayedEpisodeCount} episodios`;
  const skeletonRows = Math.min(Math.max(Number(folderData.episodeCount) || 6, 1), 6);

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <LibraryHeroBanner bannerSrc={bannerSrc} title={title} heroBottom={heroBottom} onDimNode={setBannerFadeNode} />

      <div
        ref={setListScrollNode}
        className="library-scroll relative z-10 flex h-full min-w-0 flex-col overflow-y-auto"
      >
        <div
          ref={toolbarRef}
          className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pb-4 pt-12 sm:px-6 sm:pb-6 sm:pt-14"
        >
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
                disabled={libActions.isMutating}
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
                <div className="absolute right-0 top-full mt-2 w-[300px] max-w-[calc(100vw-6rem)] max-h-[calc(100dvh-6rem)] bg-popover border border-border/70 rounded-2xl shadow-2xl z-50 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-3 border-b border-border/50 bg-secondary/20">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.09em] flex items-center gap-1.5">
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
                        setFileError(null);
                        setShowRenameModal(true);
                      }}
                      disabled={libActions.isMutating}
                      className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-secondary transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                        <FileText className="w-4 h-4 text-primary" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                          Forzar renombrado de archivos
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
                        setFileError(null);
                        setShowReorderModal(true);
                      }}
                      disabled={libActions.isMutating}
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

                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowFolderRename(true);
                      }}
                      disabled={libActions.isMutating}
                      className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-secondary transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 mt-1"
                    >
                      <span className="w-9 h-9 rounded-xl bg-secondary border border-border/60 flex items-center justify-center shrink-0 group-hover:bg-secondary/80 transition-colors">
                        <Pencil className="w-4 h-4 text-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-foreground">Cambiar nombre de la carpeta</span>
                        <span className="text-xs text-muted-foreground leading-relaxed block mt-0.5">
                          Elige entre los nombres del proveedor y de AniList, o escribe uno propio.
                        </span>
                      </span>
                    </button>
                  </div>

                  <div className="px-3 py-2 border-t border-border/50 bg-secondary/10 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>Revisa los cambios antes de aplicar. Las carpetas con descargas no se modifican.</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <LibraryHero
          title={title}
          posterLocal={folderData.posterLocal}
          episodeCount={displayedEpisodeCount}
          metaSlug={folderData.metaSlug}
          providerId={folderData.providerId}
          lang={folderData.lang}
          secondaryTitle={folderData.secondaryTitle}
          alternativeTitles={folderData.alternativeTitles}
          activeProvider={activeProvider}
          onSelectAnime={onSelectAnime}
          onPosterContextMenu={handleHeroContextMenu}
          onHeroNode={setHeroNode}
        />
        {heroMenu && (
          <LibraryFolderMenu
            x={heroMenu.x}
            y={heroMenu.y}
            onDetails={() => setShowFolderDetails(true)}
            onClose={closeHeroMenu}
          />
        )}
        <LibraryFolderDetailsDialog
          item={showFolderDetails ? folderData : null}
          onOpenChange={(open) => !open && setShowFolderDetails(false)}
        />

        <div className="hero-seam-fade relative min-w-0 shrink-0 bg-background px-4 py-4 sm:px-8 sm:py-6 md:px-10 library-episodes-section">
          {(isLoading || episodes.length > 0) && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Episodios</h2>
                <span className="text-[13px] tabular-nums text-text-tertiary">{displayedEpisodeCount}</span>
              </div>
            </div>
          )}
          {isLoading ? (
            <EpisodeListSkeleton count={skeletonRows} />
          ) : isError ? (
            <ErrorState
              title="No se pudieron cargar los episodios"
              description="No pudimos leer los archivos de esta carpeta."
              onRetry={() => refetch()}
            />
          ) : episodes.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<FolderOpen className="h-10 w-10" aria-hidden="true" />}
              title="No hay episodios en esta carpeta"
              description="Esta carpeta no contiene vídeos reproducibles. Verifica que los archivos se descargaron correctamente."
              className="min-h-0 py-12"
            />
          ) : (
            <div className="library-episodes-grid">
              {episodes.map((ep: any, i: number) => (
                <EpisodeRow
                  key={ep.path || i}
                  ep={ep}
                  onPlay={handlePlay}
                  onDelete={handleDelete}
                  onContextMenu={handleEpisodeContextMenu}
                  thumbToken={thumbEpoch}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {episodeMenu &&
        episodeMenu.folderPath === folderData.path &&
        episodes.some((episode: any) => episode.path === episodeMenu.path) && (
          <LibraryFolderMenu
            x={episodeMenu.x}
            y={episodeMenu.y}
            ariaLabel="Opciones del episodio"
            description="Archivo y tamaño"
            onDetails={() => setEpisodeDetails({ path: episodeMenu.path, folderPath: episodeMenu.folderPath })}
            onClose={closeEpisodeMenu}
          />
        )}
      <LibraryEpisodeDetailsDialog episode={selectedEpisode} onOpenChange={handleEpisodeDetailsChange} />

      <RenameDialog
        open={showRenameModal}
        onOpenChange={setShowRenameModal}
        title={title}
        folderName={folderData.name}
        renameStyle={renameStyle}
        onStyleChange={setRenameStyle}
        globalStyle={globalStyle}
        renamePreview={renamePreview}
        isFetching={isRenamePreviewFetching}
        isError={isRenamePreviewError}
        isPending={libActions.renameFiles.isPending}
        error={fileError}
        onConfirm={submitRename}
      />

      <RenameFolderDialog
        open={showFolderRename}
        onOpenChange={setShowFolderRename}
        folderPath={folderData.path}
        folderName={folderData.name}
        meta={{
          title: folderData.metaTitle ?? null,
          secondaryTitle: folderData.secondaryTitle ?? null,
          alternativeTitles: folderData.alternativeTitles ?? null,
          year: folderData.year ?? null,
          category: folderData.category ?? null,
          season: folderData.season ?? null,
          lang: folderData.lang,
        }}
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
        isError={isReorderPreviewError}
        error={fileError}
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
              onError: (error) => {
                if (!isIpcFailError(error)) toast.error(error.message || 'No se pudo eliminar el episodio');
              },
            });
            setDeleteConfirmPath(null);
          }
        }}
      />
    </div>
  );
}

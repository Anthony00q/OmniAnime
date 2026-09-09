import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  memo,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowDownUp,
  Download,
  Clock,
  Star,
  CheckSquare,
  Square,
  Search,
  X,
  List,
  BookOpen,
  FolderOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { VList } from 'virtua';
import { toast } from 'sonner';
import { useAtomValue, useSetAtom } from 'jotai';
import animeav1Icon from '../../../assets/provider-icons/animeav1-32.png';
import animeav1Icon2x from '../../../assets/provider-icons/animeav1-64.png';
import jkanimeIcon from '../../../assets/provider-icons/jkanime-32.png';
import jkanimeIcon2x from '../../../assets/provider-icons/jkanime-64.png';
import { outputDirsAtom, navigateToCatalogAtom, pendingCatalogGenreAtom, activeProviderAtom } from '../store/atoms';
import { parseEpisodeFilter } from '../utils/episodeFilter';
import { useEpisodeView } from '../utils/episodeView';
import { EpisodeViewMenu } from './libraryDetails/components/EpisodeViewMenu';
import { normalizeSeasonLabel } from '../utils/seasonLabel';
import { buildExternalUrl } from '../../utils/externalUrl';
import { useAnimeDetails, useAddToQueue } from '../hooks/useQueries';
import { Dialog } from '../components/Dialog';
import { AppTooltip } from '../components/ui/AppTooltip';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PosterImage } from '../components/anime/PosterImage';
import type { AnimeDetails, AnimeLanguage } from '../../types/anime';

interface AnimeDetailsProps {
  slug: string;
  onBack: () => void;
  onSelectAnime?: (slug: string) => void;
  isActive?: boolean;
}

const getStatusStyles = (status: string | undefined) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('emisión') || s.includes('emision') || s.includes('emitiendo')) {
    return {
      bgContainer: 'bg-emerald-500/20',
      borderContainer: 'border-emerald-500/30',
      dotBg: 'bg-emerald-500',
      text: 'text-emerald-500',
    };
  }
  if (s.includes('finalizado') || s.includes('terminado')) {
    return {
      bgContainer: 'bg-red-500/20',
      borderContainer: 'border-red-500/30',
      dotBg: 'bg-red-500',
      text: 'text-red-500',
    };
  }
  if (s.includes('próximamente') || s.includes('proximamente') || s.includes('espera')) {
    return {
      bgContainer: 'bg-amber-500/20',
      borderContainer: 'border-amber-500/30',
      dotBg: 'bg-amber-500',
      text: 'text-amber-500',
    };
  }
  return {
    bgContainer: 'bg-primary/20',
    borderContainer: 'border-primary/30',
    dotBg: 'bg-primary',
    text: 'text-primary',
  };
};

interface EpisodeGridItemProps {
  num: number;
  title?: string;
  thumbnail?: string;
  isChecked: boolean;
  isListView: boolean;
  onToggle: (num: number) => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
}

const EpisodeGridItem = memo(
  function EpisodeGridItem({
    num,
    title,
    thumbnail,
    isChecked,
    isListView,
    onToggle,
    onContextMenu,
  }: EpisodeGridItemProps) {
    return (
      <button
        type="button"
        onClick={() => onToggle(num)}
        onContextMenu={onContextMenu}
        aria-pressed={isChecked}
        aria-label={`Episodio ${num}${title && title !== 'Sin título' ? `: ${title}` : ''}. Clic derecho para cambiar la vista.`}
        className={`episode-list-item group relative flex flex-col overflow-hidden rounded-xl border text-left transition-[background-color,border-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
          isChecked
            ? isListView
              ? 'bg-primary/15 border-primary/70 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
              : 'bg-primary/10 border-primary shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
            : 'bg-card border-border/50 hover:border-primary/50 hover:bg-secondary/50'
        }`}
      >
        <span className="relative block aspect-video w-full shrink-0 overflow-hidden bg-secondary/50">
          {thumbnail ? (
            <PosterImage
              src={thumbnail}
              alt=""
              className="h-full w-full object-cover"
              fallbackLabel={`EP ${num}`}
              draggable={false}
            />
          ) : (
            <span
              className={`flex h-full w-full flex-col items-center justify-center gap-0.5 py-2 text-center ${isListView ? 'px-7' : 'px-2'}`}
            >
              <span className="max-w-full truncate text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Episodio
              </span>
              <span
                className={`max-w-full truncate text-xl font-black tabular-nums sm:text-2xl ${isListView && isChecked ? 'text-primary' : 'text-foreground'}`}
              >
                {num}
              </span>
            </span>
          )}
          {isListView ? (
            isChecked && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground shadow-md">
                <CheckSquare className="h-3.5 w-3.5" />
              </span>
            )
          ) : (
            <>
              <span
                aria-hidden="true"
                className={`absolute inset-0 bg-black/45 transition-opacity duration-150 [transition-timing-function:var(--ease-out)] ${
                  isChecked ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white backdrop-blur-sm">
                EP {num}
              </span>
              <span
                aria-hidden="true"
                className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 [transition-timing-function:var(--ease-out)] ${
                  isChecked ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
                }`}
              >
                <span className="rounded-full bg-primary p-2 text-primary-foreground shadow-lg">
                  <CheckSquare className="h-4 w-4" />
                </span>
              </span>
            </>
          )}
        </span>
        {title && title !== 'Sin título' && (
          <span className="block w-full truncate px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground">
            {title}
          </span>
        )}
      </button>
    );
  },
  (prev, next) =>
    prev.isChecked === next.isChecked &&
    prev.num === next.num &&
    prev.title === next.title &&
    prev.thumbnail === next.thumbnail &&
    prev.isListView === next.isListView &&
    prev.onToggle === next.onToggle &&
    prev.onContextMenu === next.onContextMenu,
);

function FranchiseRelationItem({
  rel,
  onSelectAnime,
}: {
  rel: { slug?: string; title?: string; poster?: string | null; type?: string };
  onSelectAnime?: (slug: string) => void;
}) {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => {
      setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rel.title]);

  const row = (
    <button
      type="button"
      onClick={() => {
        if (rel.slug) {
          if (onSelectAnime) onSelectAnime(rel.slug);
          else if ((window as any).openAnime) (window as any).openAnime(rel.slug);
        } else {
          toast.error('No se pudo navegar: falta el identificador');
        }
      }}
      className="-mx-2 flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <PosterImage
        src={rel.poster}
        alt={rel.title ?? ''}
        fallbackLabel={rel.title}
        className="h-16 w-12 shrink-0 rounded-md bg-secondary object-cover"
      />
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-bold text-primary uppercase tracking-wider">{rel.type}</span>
        <span ref={titleRef} className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
          {rel.title}
        </span>
      </div>
    </button>
  );

  if (!isTruncated || !rel.title) return row;
  return (
    <AppTooltip content={rel.title} side="top" align="start">
      {row}
    </AppTooltip>
  );
}

function useGridCols(): number {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setCols(6);
      else if (w >= 1024) setCols(5);
      else if (w >= 768) setCols(4);
      else if (w >= 640) setCols(3);
      else setCols(2);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return cols;
}

function useShouldVirtualize(rowCount: number, withThumbs: boolean): boolean {
  const [should, setShould] = useState(false);
  useEffect(() => {
    const calc = () => {
      if (rowCount === 0) {
        setShould(false);
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isSm = w >= 640;
      const rowH = withThumbs ? (isSm ? 170 : 150) : isSm ? 96 : 80;
      const gap = 12;
      const estimated = rowCount * rowH + Math.max(0, rowCount - 1) * gap;
      const maxH = h * 0.55;
      setShould(estimated > maxH && rowCount > 3);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [rowCount, withThumbs]);
  return should;
}

export function AnimeDetailsView({ slug, onBack, onSelectAnime, isActive }: AnimeDetailsProps) {
  const { data, isLoading, isError, refetch } = useAnimeDetails(slug);
  const addToQueue = useAddToQueue();
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (isActive === false) {
      setShowRangeModal(false);
      setShowDirPicker(false);
      setViewMenu(null);
      setIsTopScrolled(false);
    }
  }, [isActive]);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState('');
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [selectedLang, setSelectedLang] = useState<'SUB'>('SUB'); // DUB desactivado: solo SUB
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [selectedDirIndex, setSelectedDirIndex] = useState(0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [epQuery, setEpQuery] = useState('');
  const [epView, setEpView] = useEpisodeView();
  const [viewMenu, setViewMenu] = useState<{ x: number; y: number } | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const [isTopScrolled, setIsTopScrolled] = useState(false);

  const handleEpContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    setViewMenu({ x: event.clientX, y: event.clientY });
  }, []);
  const closeViewMenu = useCallback(() => setViewMenu(null), []);

  useEffect(() => {
    setSelected(new Set());
    setRangeFrom('1');
    setRangeTo('');
    setShowFullSynopsis(false);
    setShowRangeModal(false);
    setShowDirPicker(false);
    setSelectedDirIndex(0);
    setSortDir('asc');
    setEpQuery('');
    setViewMenu(null);
    setIsTopScrolled(false);
  }, [slug]);

  const availableLanguages: AnimeLanguage[] = ['SUB']; // DUB desactivado: solo SUB

  const outputDirs = useAtomValue(outputDirsAtom);
  const activeProviderId = useAtomValue(activeProviderAtom);
  const navigateToCatalog = useSetAtom(navigateToCatalogAtom);
  const setPendingGenre = useSetAtom(pendingCatalogGenreAtom);

  const dataSlug = (data as AnimeDetails | undefined)?.slug;
  const externalUrl = useMemo(
    () => buildExternalUrl(dataSlug || slug, activeProviderId),
    [activeProviderId, dataSlug, slug],
  );

  const providerName = activeProviderId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';

  const handleOpenExternal = useCallback(async () => {
    if (!externalUrl) return;
    try {
      const ok = await window.api.invoke('open-external-url', externalUrl);
      if (!ok) toast.error('No se pudo abrir el enlace externo');
    } catch {
      toast.error('No se pudo abrir el enlace externo');
    }
  }, [externalUrl]);

  useEffect(() => {
    if (data?.episodes?.length) {
      const lastEp = data.episodes[data.episodes.length - 1] as unknown;
      const maxEpNum =
        typeof lastEp === 'number'
          ? lastEp
          : ((lastEp as { episodeNumber?: number })?.episodeNumber ?? data.episodes.length);
      setRangeTo(String(maxEpNum));
    }
  }, [data?.episodes]);

  // DUB desactivado: solo SUB — selectedLang fijo en SUB

  useEffect(() => {
    const handleClose = (e: Event) => {
      if (!isActiveRef.current) return;
      e.preventDefault(); // Stop App.tsx from processing this further
      if (showRangeModal) {
        setShowRangeModal(false);
      } else if (showDirPicker) {
        setShowDirPicker(false);
      } else {
        onBack();
      }
    };
    window.addEventListener('close-modals', handleClose);
    return () => window.removeEventListener('close-modals', handleClose);
  }, [onBack, showRangeModal, showDirPicker]);

  useEffect(() => {
    const root = topScrollRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        setIsTopScrolled(!entries[0].isIntersecting);
      },
      { root, threshold: 0, rootMargin: '-8px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [slug, dataSlug, isLoading, isError]);

  const cols = useGridCols();

  const episodeThumbnails = data?.episodeThumbnails;
  interface VisibleEpisode {
    num: number;
    title?: string;
    thumbnail?: string;
  }
  const allEpisodes = useMemo<VisibleEpisode[]>(() => {
    const eps = data?.episodes;
    if (!eps) return [];
    return eps.map((e: unknown, i: number) => {
      const num = typeof e === 'number' ? e : ((e as { episodeNumber?: number })?.episodeNumber ?? i + 1);
      const title = (e as { title?: string })?.title;
      const thumbnail = episodeThumbnails?.[num];
      return { num, title, thumbnail };
    });
  }, [data?.episodes, episodeThumbnails]);

  const allEpNums = useMemo(() => allEpisodes.map((e: { num: number }) => e.num), [allEpisodes]);

  // Orden + filtro solo-vista: la selección (por número) no se ve afectada.
  const episodeFilter = useMemo(() => parseEpisodeFilter(epQuery), [epQuery]);
  const visibleEpisodes = useMemo<VisibleEpisode[]>(() => {
    const list = episodeFilter ? allEpisodes.filter((e) => episodeFilter.has(e.num)) : [...allEpisodes];
    list.sort((a, b) => (sortDir === 'asc' ? a.num - b.num : b.num - a.num));
    return list;
  }, [allEpisodes, episodeFilter, sortDir]);
  const visibleEpNums = useMemo(() => visibleEpisodes.map((e) => e.num), [visibleEpisodes]);

  const rows = useMemo(() => {
    const r: VisibleEpisode[][] = [];
    for (let i = 0; i < visibleEpisodes.length; i += cols) r.push(visibleEpisodes.slice(i, i + cols));
    return r;
  }, [visibleEpisodes, cols]);

  const withThumbs = epView === 'cards';
  const shouldVirtualize = useShouldVirtualize(rows.length, withThumbs);

  const toggleEp = useCallback((num: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set<number>(visibleEpNums)), [visibleEpNums]);
  const selectNone = useCallback(() => setSelected(new Set<number>()), []);

  const applyRange = useCallback(() => {
    const from = parseInt(rangeFrom, 10);
    const to = parseInt(rangeTo, 10);
    if (isNaN(from) || isNaN(to) || from > to) {
      toast.error('Rango inválido');
      return;
    }
    const inRange = new Set<number>(allEpNums.filter((n: number) => n >= from && n <= to));
    setSelected(inRange);
    setShowRangeModal(false);
  }, [rangeFrom, rangeTo, allEpNums]);

  const handleDownloadSelected = async () => {
    if (selected.size === 0) return toast.error('No hay episodios seleccionados');

    if (outputDirs.length > 1) {
      setShowDirPicker(true);
      return;
    }

    await executeDownload(0);
  };

  const executeDownload = async (dirIndex: number) => {
    if (!data) {
      toast.error('No hay datos del anime para descargar');
      return;
    }
    setShowDirPicker(false);
    const eps = Array.from(selected).sort((a, b) => a - b);
    const loadingId = `add-queue-${data.slug}`;
    toast.loading(`Agregando ${eps.length} episodios a la cola...`, { id: loadingId });
    addToQueue.mutate(
      {
        slug: data.slug,
        animeTitle: data.title,
        episodes: eps,
        preferredServer: 'Auto',
        lang: selectedLang,
        outputDirIndex: dirIndex,
      },
      {
        onSuccess: (result) => {
          toast.dismiss(loadingId);
          if (result) toast.success(`${eps.length} episodio(s) añadidos a la cola`);
          else toast.error('No se pudo agregar a la cola');
        },
        onError: () => {
          toast.dismiss(loadingId);
          toast.error('Error al agregar a la cola');
        },
      },
    );
  };

  if (!slug) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background text-muted-foreground gap-4 p-8 text-center select-none">
        <BookOpen className="w-16 h-16 opacity-25 text-primary animate-pulse" />
        <h3 className="text-xl font-bold text-foreground mt-2">Ficha de Información</h3>
        <p className="max-w-md text-sm opacity-60 leading-relaxed">
          Selecciona cualquier anime de la sección de <strong>Inicio</strong> o <strong>Catálogo</strong> para ver sus
          detalles completos, géneros, estado y gestionar las descargas de sus episodios.
        </p>
        <button
          type="button"
          onClick={() => navigateToCatalog()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Ir al catálogo
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingState className="h-full bg-background" label="Cargando detalles" />;
  }

  if (isError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background">
        <ErrorState
          title="No se encontró el anime"
          description="No pudimos cargar sus detalles."
          onRetry={() => refetch()}
        />
        <button
          type="button"
          onClick={onBack}
          className="-mt-10 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Volver
        </button>
      </div>
    );
  }

  const statusStyles = getStatusStyles(data.status);

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="absolute left-0 top-0 z-0 h-[46vh] min-h-[240px] w-full overflow-hidden">
        <PosterImage
          src={data.banner || data.poster}
          alt={`Banner de ${data.title}`}
          priority={!!isActive}
          className="h-full w-full scale-105 object-cover opacity-10 blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background"></div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-background to-transparent"
        />
      </div>

      <div ref={topScrollRef} className="z-10 flex h-full min-w-0 flex-col overflow-y-auto">
        <div ref={topSentinelRef} aria-hidden="true" className="h-px w-full shrink-0" />
        <div className="sticky top-0 z-20 flex items-center justify-between p-4 sm:p-6">
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/80 to-transparent transition-opacity duration-200 ${
              isTopScrolled ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <button
            type="button"
            onClick={onBack}
            className="group relative flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-medium text-white backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-200 hover:bg-black/60 hover:border-white/20 hover:shadow-lg hover:shadow-black/20 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:px-4"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> Volver
          </button>
        </div>

        <div className="relative flex shrink-0 flex-col gap-5 px-4 pb-6 sm:flex-row sm:gap-8 sm:px-8 md:px-10 md:pb-8">
          <div className="sala-frame w-36 shrink-0 self-center overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_16px_48px_rgba(0,0,0,0.5)] sm:w-48 sm:self-start md:w-64">
            <PosterImage
              src={data.poster}
              alt={data.title}
              priority={!!isActive}
              fallbackLabel={data.title}
              className="aspect-[2/3] h-auto w-full object-cover"
            />
          </div>

          <div className="flex min-w-0 flex-col items-center justify-center pb-2 text-center sm:items-start sm:pb-4 sm:pt-4 sm:text-left">
            <h1 className="select-text cursor-text text-2xl font-black leading-[1.1] tracking-[-0.02em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-4xl md:text-5xl">
              {data.title}
            </h1>

            {(data.japaneseTitle || (data.alternativeTitles && data.alternativeTitles.length > 0)) && (
              <h2 className="mb-4 select-text cursor-text text-base font-semibold text-white/60 sm:mb-6 sm:text-xl">
                {data.japaneseTitle || data.alternativeTitles?.join(', ')}
              </h2>
            )}

            <p className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] font-medium text-muted-foreground sm:mb-5 sm:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-flex h-2 w-2 shrink-0 rounded-full ${statusStyles.dotBg}`}
                  aria-hidden="true"
                ></span>
                <span className={`font-semibold ${statusStyles.text}`}>{data.status || 'Desconocido'}</span>
              </span>
              {data.year && (
                <>
                  <span aria-hidden="true" className="text-border-strong">
                    |
                  </span>
                  <span className="tabular-nums">{data.year}</span>
                </>
              )}
              {data.type && (
                <>
                  <span aria-hidden="true" className="text-border-strong">
                    |
                  </span>
                  <span>{data.type}</span>
                </>
              )}
              {data.category &&
                data.category.trim().toLowerCase() !==
                  String(data.type || '')
                    .trim()
                    .toLowerCase() && (
                  <>
                    <span aria-hidden="true" className="text-border-strong">
                      |
                    </span>
                    <span>{data.category}</span>
                  </>
                )}
              {data.score > 0 && (
                <>
                  <span aria-hidden="true" className="text-border-strong">
                    |
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                    <span className="tabular-nums">{data.score}</span>
                    {data.votes > 0 && (
                      <span className="font-medium tabular-nums text-muted-foreground">
                        ({new Intl.NumberFormat('es', { notation: 'compact' }).format(data.votes)})
                      </span>
                    )}
                  </span>
                </>
              )}
            </p>

            {data.genres && data.genres.length > 0 && (
              <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
                {data.genres.map((g: string, idx: number) => (
                  <span key={idx} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingGenre(g);
                        navigateToCatalog();
                      }}
                      aria-label={`Ver ${g} en el catálogo`}
                      className="rounded px-1 py-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      {g}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-background"
          />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-8 bg-background px-4 py-6 sm:px-8 md:px-10 md:py-8 xl:grid-cols-3 xl:gap-12">
          <div className="min-w-0 space-y-8 xl:col-span-2">
            <section>
              <h3 className="text-xl font-bold mb-3 text-foreground">Sinopsis</h3>
              <div>
                <p
                  className={`text-muted-foreground leading-relaxed select-text cursor-text ${showFullSynopsis ? '' : 'line-clamp-4'}`}
                >
                  {data.description || 'No hay sinopsis disponible para este anime.'}
                </p>
                {data.description && data.description.length > 280 && (
                  <button
                    onClick={() => setShowFullSynopsis((p) => !p)}
                    aria-expanded={showFullSynopsis}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {showFullSynopsis ? (
                      <>
                        Leer menos <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        Leer más <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex shrink-0 items-center gap-2 text-xl font-bold text-foreground">
                  <Clock className="h-5 w-5 text-primary" /> Episodios
                </h3>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">
                    {episodeFilter
                      ? `${visibleEpisodes.length} de ${allEpisodes.length}`
                      : `${allEpisodes.length} disponibles`}
                  </span>
                  <div className="group relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={epQuery}
                      onChange={(event) => setEpQuery(event.target.value)}
                      placeholder="7, 5-7…"
                      aria-label="Buscar episodios por número"
                      autoComplete="off"
                      className="h-8 w-28 rounded-lg border border-border/60 bg-secondary/50 pl-8 pr-7 text-xs text-foreground transition-[border-color,box-shadow,width] placeholder:text-muted-foreground/60 hover:border-border-strong focus:w-36 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {epQuery && (
                      <button
                        type="button"
                        onClick={() => setEpQuery('')}
                        aria-label="Limpiar búsqueda de episodios"
                        className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <AppTooltip content={sortDir === 'asc' ? 'Menor a mayor' : 'Mayor a menor'}>
                    <button
                      type="button"
                      onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                      aria-label={sortDir === 'asc' ? 'Ordenar de mayor a menor' : 'Ordenar de menor a mayor'}
                      aria-pressed={sortDir === 'desc'}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <ArrowDownUp className="h-4 w-4" />
                    </button>
                  </AppTooltip>
                </div>
              </div>

              <div className="mb-4 flex min-w-0 flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={selectAll}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> Todos
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" /> Ninguno
                </button>
                <button
                  type="button"
                  onClick={() => setShowRangeModal(true)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 cursor-pointer"
                >
                  <List className="w-3.5 h-3.5" /> Rango...
                </button>

                <div className="ml-0 flex items-center rounded-full border border-border/60 bg-secondary/50 p-0.5 sm:ml-2">
                  {availableLanguages.includes('SUB') && (
                    <AppTooltip content="SUB disponible para este anime">
                      <button
                        type="button"
                        onClick={() => setSelectedLang('SUB')}
                        aria-label="Seleccionar subtítulos SUB"
                        className={`px-3 py-1 text-[11px] font-bold rounded-full transition-colors cursor-pointer ${selectedLang === 'SUB' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        SUB
                      </button>
                    </AppTooltip>
                  )}
                  {/* DUB desactivado: solo SUB */}
                </div>

                <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap sm:justify-end sm:gap-3">
                  <span className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground">
                    {selected.size} seleccionado(s)
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadSelected}
                    disabled={selected.size === 0 || addToQueue.isPending}
                    className="flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:flex-none sm:px-4"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {selected.size === 0
                      ? 'Sin selección'
                      : visibleEpNums.length > 0 && selected.size === visibleEpNums.length
                        ? `Descargar Todo (${selected.size})`
                        : `Descargar (${selected.size})`}
                  </button>
                </div>
              </div>

              {rows.length === 0 ? (
                episodeFilter ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-sm text-muted-foreground">Sin coincidencias para «{epQuery.trim()}»</p>
                    <button
                      type="button"
                      onClick={() => setEpQuery('')}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      Limpiar búsqueda
                    </button>
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">No hay episodios disponibles</div>
                )
              ) : shouldVirtualize ? (
                <VList data={rows} style={{ height: '55vh', maxHeight: '55vh' }} className="custom-scrollbar pr-2">
                  {(row, rowIndex) => (
                    <div
                      key={rowIndex}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                        gap: '12px',
                        paddingBottom: '12px',
                      }}
                    >
                      {row.map(({ num, title, thumbnail }) => (
                        <EpisodeGridItem
                          key={num}
                          num={num}
                          title={title}
                          thumbnail={withThumbs ? thumbnail : undefined}
                          isChecked={selected.has(num)}
                          isListView={!withThumbs}
                          onToggle={toggleEp}
                          onContextMenu={handleEpContextMenu}
                        />
                      ))}
                    </div>
                  )}
                </VList>
              ) : (
                <div
                  className="grid pr-2"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gap: '12px',
                  }}
                >
                  {visibleEpisodes.map(({ num, title, thumbnail }: VisibleEpisode) => (
                    <EpisodeGridItem
                      key={num}
                      num={num}
                      title={title}
                      thumbnail={withThumbs ? thumbnail : undefined}
                      isChecked={selected.has(num)}
                      isListView={!withThumbs}
                      onToggle={toggleEp}
                      onContextMenu={handleEpContextMenu}
                    />
                  ))}
                </div>
              )}
              {viewMenu && (
                <EpisodeViewMenu
                  x={viewMenu.x}
                  y={viewMenu.y}
                  view={epView}
                  onSelect={setEpView}
                  onClose={closeViewMenu}
                />
              )}
            </section>
          </div>

          <div className="space-y-6">
            <div className="p-5 rounded-xl bg-card border border-border/50">
              <h4 className="font-bold mb-1 text-foreground border-b border-border pb-2">Detalles</h4>
              <ul className="text-sm">
                <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
                  <span className="text-[13px] text-muted-foreground">Tipo</span>
                  <span className="text-sm font-medium text-foreground">{data.type || 'TV'}</span>
                </li>
                {data.studio && data.studio.toLowerCase() !== 'desconocido' && (
                  <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
                    <span className="text-[13px] text-muted-foreground">Estudio</span>
                    <span className="text-sm font-medium text-foreground">{data.studio}</span>
                  </li>
                )}
                {normalizeSeasonLabel(data.season) && (
                  <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
                    <span className="text-[13px] text-muted-foreground">Temporada</span>
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {normalizeSeasonLabel(data.season)}
                    </span>
                  </li>
                )}
                {data.availableLanguages && data.availableLanguages.length > 0 && (
                  <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
                    <span className="text-[13px] text-muted-foreground">Idioma</span>
                    <span className="text-sm font-medium text-foreground">{data.availableLanguages.join(' · ')}</span>
                  </li>
                )}
                {externalUrl && (
                  <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
                    <span className="text-[13px] text-muted-foreground">Fuente</span>
                    <AppTooltip content={`Ver en ${providerName}`}>
                      <button
                        type="button"
                        onClick={handleOpenExternal}
                        aria-label={`Abrir ${data.title} en ${providerName} en el navegador`}
                        className="inline-flex items-center gap-2 rounded-md border border-transparent bg-secondary/50 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary hover:border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <img
                          src={activeProviderId === 'jkanime' ? jkanimeIcon : animeav1Icon}
                          srcSet={`${activeProviderId === 'jkanime' ? jkanimeIcon2x : animeav1Icon2x} 2x`}
                          width={20}
                          height={20}
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                          decoding="async"
                          className="h-5 w-5 rounded-[3px] object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span>{providerName}</span>
                      </button>
                    </AppTooltip>
                  </li>
                )}
              </ul>
            </div>

            {data.relations && data.relations.length > 0 && (
              <div className="p-5 rounded-xl bg-card border border-border/50">
                <h4 className="font-bold mb-4 text-foreground border-b border-border pb-2">Franquicia</h4>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                  {data.relations.map((rel: any, idx: number) => (
                    <FranchiseRelationItem key={rel.slug || idx} rel={rel} onSelectAnime={onSelectAnime} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={showRangeModal}
        onOpenChange={setShowRangeModal}
        title="Seleccionar Rango"
        message="Indica el rango de episodios que quieres marcar."
        confirmLabel="Aplicar"
        danger={false}
        onConfirm={applyRange}
      >
        <div className="flex items-center gap-3 -mt-1">
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Desde</label>
            <input
              type="number"
              min="1"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <span className="text-muted-foreground mt-5">—</span>
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Hasta</label>
            <input
              type="number"
              min="1"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={showDirPicker}
        onOpenChange={setShowDirPicker}
        title="Seleccionar carpeta de destino"
        message="Elige dónde guardar esta descarga"
        confirmLabel="Descargar aquí"
        className="max-w-md"
        danger={false}
        onConfirm={() => executeDownload(selectedDirIndex)}
      >
        <div className="space-y-2 max-h-60 overflow-y-auto -mt-1">
          {outputDirs.map((dir, i) => (
            <button
              key={i}
              onClick={() => setSelectedDirIndex(i)}
              aria-pressed={i === selectedDirIndex}
              aria-label={`Seleccionar carpeta ${i + 1}: ${dir || `Carpeta ${i + 1}`}`}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-[background-color,border-color,box-shadow,color] text-sm cursor-pointer ${
                i === selectedDirIndex
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border/50 bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="truncate">{dir || `Carpeta ${i + 1}`}</span>
              </div>
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

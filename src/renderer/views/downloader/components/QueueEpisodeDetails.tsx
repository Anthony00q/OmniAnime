import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { DETAIL_MIN_H, DETAIL_ROW_H, shouldShowDetailResizer } from '@/renderer/utils/detailHeight';
import type { DetailRow } from '@/renderer/utils/downloaderRows';
import { useQueueDetailResize } from '@/renderer/views/downloader/hooks/useQueueDetailResize';
import { EpisodeDetailRow } from './EpisodeDetailRow';

interface QueueEpisodeDetailsProps {
  id: string;
  open: boolean;
  rows: DetailRow[];
  itemId: string;
  animeTitle: string;
  pendingEpisodeKeys?: Set<string>;
  pendingSkipEpKeys?: Set<string>;
  onPauseEpisode: (id: string, episode: number) => void;
  onResumeEpisode: (id: string, episode: number) => void;
  onSkipEpisode: (id: string, episode: number) => void;
  onCancelEpisode: (id: string, episode: number) => void;
}

export const QueueEpisodeDetails = memo(function QueueEpisodeDetails({
  id,
  open,
  rows,
  itemId,
  animeTitle,
  pendingEpisodeKeys,
  pendingSkipEpKeys,
  onPauseEpisode,
  onResumeEpisode,
  onSkipEpisode,
  onCancelEpisode,
}: QueueEpisodeDetailsProps) {
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const {
    detailHeight,
    detailMax,
    isResizingDetail,
    handleDetailResizeStart,
    handleDetailResizeKey,
    handleDetailResizeReset,
    endDetailResize,
  } = useQueueDetailResize(open, rows.length);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const root = detailScrollRef.current;
      const target = root?.querySelector<HTMLElement>('[data-ep-state="active"]');
      if (!root || !target) return;
      const top = target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      root.scrollTop = Math.max(0, top);
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div
      id={id}
      className="downloader-card-slot-parallel"
      data-state={open ? 'open' : 'closed'}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div
        className="downloader-card-slot-parallel-content"
        style={{ '--detail-h': `${detailHeight}px` } as CSSProperties}
      >
        <div className="downloader-detail-panel">
          <div ref={detailScrollRef} className="downloader-detail-scroll">
            {rows.map((row) => (
              <EpisodeDetailRow
                key={row.episode}
                row={row}
                itemId={itemId}
                animeTitle={animeTitle}
                isEpPending={pendingEpisodeKeys?.has(`${itemId}:${row.episode}`) ?? false}
                isEpSwitching={pendingSkipEpKeys?.has(`${itemId}:${row.episode}`) ?? false}
                onPauseEpisode={onPauseEpisode}
                onResumeEpisode={onResumeEpisode}
                onSkipEpisode={onSkipEpisode}
                onCancelEpisode={onCancelEpisode}
              />
            ))}
          </div>
          {shouldShowDetailResizer(rows.length, detailHeight, isResizingDetail) && (
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={`Altura del detalle (${rows.length} episodios). Arrastra para ver más o menos episodios, doble clic para restablecer.`}
              aria-valuemin={DETAIL_MIN_H}
              aria-valuemax={detailMax}
              aria-valuenow={detailHeight}
              aria-valuetext={`${Math.min(rows.length, Math.max(1, Math.round(detailHeight / DETAIL_ROW_H)))} de ${rows.length} episodios visibles`}
              tabIndex={0}
              data-resizing={isResizingDetail || undefined}
              className="downloader-detail-resizer"
              onPointerDown={handleDetailResizeStart}
              onPointerUp={endDetailResize}
              onPointerCancel={endDetailResize}
              onLostPointerCapture={endDetailResize}
              onKeyDown={handleDetailResizeKey}
              onDoubleClick={handleDetailResizeReset}
            >
              <span aria-hidden="true" className="downloader-detail-resizer-grip" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

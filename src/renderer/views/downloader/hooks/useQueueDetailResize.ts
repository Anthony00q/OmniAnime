import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  DETAIL_DEFAULT_H,
  DETAIL_MIN_H,
  DETAIL_ROW_H,
  detailMaxForRows,
  snapDetailHeight,
} from '@/renderer/utils/detailHeight';

export function useQueueDetailResize(open: boolean, rowCount: number) {
  const detailMax = detailMaxForRows(rowCount);
  const [detailHeight, setDetailHeight] = useState(DETAIL_DEFAULT_H);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number; pointerId: number; el: HTMLDivElement } | null>(null);
  const heightRef = useRef(detailHeight);
  const maxRef = useRef(detailMax);
  heightRef.current = detailHeight;
  maxRef.current = detailMax;

  const handleDetailResizeMoveWindow = useCallback((event: globalThis.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDetailHeight(snapDetailHeight(drag.startH + event.clientY - drag.startY, maxRef.current));
  }, []);

  const endDetailResize = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) {
      try {
        drag.el.releasePointerCapture(drag.pointerId);
      } catch {}
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    setIsResizingDetail(false);
    window.removeEventListener('pointermove', handleDetailResizeMoveWindow);
    window.removeEventListener('pointerup', endDetailResize);
    window.removeEventListener('pointercancel', endDetailResize);
    window.removeEventListener('blur', endDetailResize);
  }, [handleDetailResizeMoveWindow]);

  const handleDetailResizeStart = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || dragRef.current) return;
      event.preventDefault();
      dragRef.current = {
        startY: event.clientY,
        startH: heightRef.current,
        pointerId: event.pointerId,
        el: event.currentTarget,
      };
      setIsResizingDetail(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
      window.addEventListener('pointermove', handleDetailResizeMoveWindow);
      window.addEventListener('pointerup', endDetailResize);
      window.addEventListener('pointercancel', endDetailResize);
      window.addEventListener('blur', endDetailResize);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [endDetailResize, handleDetailResizeMoveWindow],
  );

  const handleDetailResizeKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? DETAIL_ROW_H : -DETAIL_ROW_H;
        setDetailHeight((height) => snapDetailHeight(height + delta, detailMax));
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setDetailHeight(event.key === 'Home' ? DETAIL_MIN_H : detailMax);
      } else if (event.key === 'Escape' && dragRef.current) {
        event.preventDefault();
        setDetailHeight(snapDetailHeight(dragRef.current.startH, detailMax));
        endDetailResize();
      }
    },
    [detailMax, endDetailResize],
  );

  const handleDetailResizeReset = useCallback(() => {
    setDetailHeight(snapDetailHeight(DETAIL_DEFAULT_H, maxRef.current));
  }, []);

  useEffect(() => {
    if (open) setDetailHeight(snapDetailHeight(DETAIL_DEFAULT_H, detailMaxForRows(rowCount)));
    else endDetailResize();
  }, [open, rowCount, endDetailResize]);

  useEffect(() => endDetailResize, [endDetailResize]);

  return {
    detailHeight,
    detailMax,
    isResizingDetail,
    handleDetailResizeStart,
    handleDetailResizeKey,
    handleDetailResizeReset,
    endDetailResize,
  };
}

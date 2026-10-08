import { cubicBezier, spring } from 'animejs';

export const MOTION_DURATION = {
  micro: 120,
  base: 200,
  enter: 320,
  emphatic: 480,
} as const;

export const MOTION_STAGGER_STEP = 28;
export const MOTION_STAGGER_CAP = 360;
export const MOTION_RISE_PX = 10;
export const MOTION_FADE_MS = 150;

export const easeOut = cubicBezier(0.23, 1, 0.32, 1);

export function springEase(duration: number, bounce = 0.2) {
  return spring({ duration, bounce });
}

export function staggerDelay(index: number, batchSize: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(batchSize)) return 0;
  const size = Math.max(0, Math.floor(batchSize));
  if (size <= 1) return 0;
  const step = Math.min(MOTION_STAGGER_STEP, MOTION_STAGGER_CAP / (size - 1));
  return Math.min(Math.max(0, index), size - 1) * step;
}

export const HERO_DIM_MAX = 0.65;
export const HERO_DIM_DISTANCE = 280;
export const HERO_DIM_SMOOTHING = 0.22;

const HERO_DIM_EPSILON = 0.002;

export interface HeroDimSmoother {
  step: (target: number, deltaMs?: number) => number;
}

export function createHeroDimSmoother(reduced: boolean): HeroDimSmoother {
  let current: number | null = null;
  return {
    step(target, deltaMs = 1000 / 60) {
      if (reduced || current === null) {
        current = target;
        return current;
      }
      const elapsedFrames = Math.min(Math.max(0, deltaMs), 50) / (1000 / 60);
      const smoothing = 1 - Math.pow(1 - HERO_DIM_SMOOTHING, elapsedFrames);
      const next = current + (target - current) * smoothing;
      current = Math.abs(target - next) < HERO_DIM_EPSILON ? target : next;
      return current;
    },
  };
}

export function createHeroDimController(
  readTarget: () => number,
  writeOpacity: (opacity: number) => void,
  reduced: boolean,
) {
  const smoother = createHeroDimSmoother(reduced);
  let frame: number | null = null;
  let previousFrameTime: number | null = null;
  let disposed = false;

  const request = () => {
    if (!disposed && frame === null) frame = requestAnimationFrame(apply);
  };
  const apply = (timestamp: number) => {
    if (disposed) return;
    frame = null;
    const deltaMs = previousFrameTime === null ? 1000 / 60 : timestamp - previousFrameTime;
    const target = readTarget();
    const dim = smoother.step(target, deltaMs);
    writeOpacity(1 - dim);
    previousFrameTime = dim === target ? null : timestamp;
    if (dim !== target) request();
  };
  apply(performance.now());

  return {
    request,
    dispose: () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

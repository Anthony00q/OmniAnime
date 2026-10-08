export const HERO_DIM_MAX = 0.65;
export const HERO_DIM_DISTANCE = 280;
export const HERO_DIM_SMOOTHING = 0.22;

const HERO_DIM_EPSILON = 0.002;

export interface HeroDimSmoother {
  step: (target: number) => number;
}

export function createHeroDimSmoother(reduced: boolean): HeroDimSmoother {
  let current: number | null = null;
  return {
    step(target) {
      if (reduced || current === null) {
        current = target;
        return current;
      }
      const next = current + (target - current) * HERO_DIM_SMOOTHING;
      current = Math.abs(target - next) < HERO_DIM_EPSILON ? target : next;
      return current;
    },
  };
}

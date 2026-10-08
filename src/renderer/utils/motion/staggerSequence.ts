export interface StaggerSnapshot {
  keys: readonly string[] | null;
  scopeKey: unknown;
  replay: unknown;
  pendingReplay: boolean;
  suppressHydration: boolean;
}

export interface StaggerPlan {
  indexes: number[];
  snapshot: StaggerSnapshot;
}

function createSnapshot(
  keys: readonly string[] | null,
  scopeKey: unknown,
  replay: unknown,
  pendingReplay = false,
  suppressHydration = false,
): StaggerSnapshot {
  return { keys, scopeKey, replay, pendingReplay, suppressHydration };
}

function hasStableKeys(keys: readonly (string | null)[]): keys is readonly string[] {
  if (keys.some((key) => typeof key !== 'string' || key.trim().length === 0)) return false;
  return new Set(keys).size === keys.length;
}

function allIndexes(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

function appendedIndexes(previous: readonly string[], next: readonly string[]): number[] | null {
  if (next.length <= previous.length) return null;
  if (!previous.every((key, index) => key === next[index])) return null;
  return allIndexes(next.length).slice(previous.length);
}

export function resolveStaggerPlan(
  previous: StaggerSnapshot | null,
  keys: readonly (string | null)[],
  scopeKey: unknown,
  replay?: unknown,
): StaggerPlan {
  if (!hasStableKeys(keys)) {
    return { indexes: [], snapshot: createSnapshot(null, scopeKey, replay, false, true) };
  }

  const currentKeys = [...keys];
  if (!previous) {
    return {
      indexes: allIndexes(currentKeys.length),
      snapshot: createSnapshot(currentKeys, scopeKey, replay),
    };
  }

  const replayChanged = previous.replay !== replay;
  if (replayChanged || previous.pendingReplay) {
    if (currentKeys.length === 0) {
      return {
        indexes: [],
        snapshot: createSnapshot(currentKeys, scopeKey, replay, true),
      };
    }
    return {
      indexes: allIndexes(currentKeys.length),
      snapshot: createSnapshot(currentKeys, scopeKey, replay),
    };
  }

  if (previous.scopeKey !== scopeKey) {
    return {
      indexes: [],
      snapshot: createSnapshot(currentKeys, scopeKey, replay, false, true),
    };
  }

  if (previous.keys === null || previous.suppressHydration) {
    return { indexes: [], snapshot: createSnapshot(currentKeys, scopeKey, replay) };
  }

  if (previous.keys.length === currentKeys.length && previous.keys.every((key, index) => key === currentKeys[index])) {
    return { indexes: [], snapshot: createSnapshot(currentKeys, scopeKey, replay) };
  }

  const appended = appendedIndexes(previous.keys, currentKeys);
  if (appended) {
    return {
      indexes: appended,
      snapshot: createSnapshot(currentKeys, scopeKey, replay),
    };
  }

  return { indexes: [], snapshot: createSnapshot(currentKeys, scopeKey, replay) };
}

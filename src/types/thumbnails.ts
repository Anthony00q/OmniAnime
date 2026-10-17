export type ThumbnailPriority = 'visible' | 'prefetch';

export type ThumbnailCommand =
  | { operation: 'request'; requestId: string; videoPath: string; priority: ThumbnailPriority; refresh?: boolean }
  | { operation: 'release'; requestId: string }
  | { operation: 'priority'; requestId: string; priority: ThumbnailPriority };

export interface ThumbnailRequest {
  promise: Promise<string | null>;
  release: () => void;
  setPriority: (priority: ThumbnailPriority) => void;
}

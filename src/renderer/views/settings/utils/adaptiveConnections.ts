import type { AdaptiveServerId } from '@/types/settings';
import { isAdaptiveEnabledForServer, normalizeAdaptiveConnections } from '@/utils/downloads/downloadSettings';

// Adaptive sustituye la concurrencia manual de los servidores que gobierna: con su
// toggle ON, el valor manual pasa a ser solo la semilla. HLS y Mega quedan fuera.

export const ADAPTIVE_MANAGED_CONNECTION_KEYS = [
  'mediafireConnections',
  'mp4uploadConnections',
  'voeConnections',
] as const;

export type AdaptiveManagedConnectionKey = (typeof ADAPTIVE_MANAGED_CONNECTION_KEYS)[number];

// Cada control manual mapea a su servidor con la misma identidad de
// `isAdaptiveEnabledForServer`.
const ADAPTIVE_SERVER_BY_CONTROL_KEY: Record<AdaptiveManagedConnectionKey, AdaptiveServerId> = {
  mediafireConnections: 'mediafire',
  mp4uploadConnections: 'mp4upload',
  voeConnections: 'voe',
};

// Filas de servidores del selector por servidor (HLS y Mega nunca aparecen).
export const ADAPTIVE_SERVER_ROWS: ReadonlyArray<{ id: AdaptiveServerId; label: string }> = [
  { id: 'mediafire', label: 'MediaFire' },
  { id: 'mp4upload', label: 'MP4Upload' },
  { id: 'voe', label: 'Voe' },
];

export function isAdaptiveManagedConnectionKey(key: string): key is AdaptiveManagedConnectionKey {
  return (ADAPTIVE_MANAGED_CONNECTION_KEYS as readonly string[]).includes(key);
}

// Un control queda bloqueado solo si Adaptive está activo para SU servidor. El
// valor guardado no se toca nunca aquí: eso es cosa de settings.
export function isConnectionControlLocked(key: string, adaptiveConnections: unknown): boolean {
  if (!isAdaptiveManagedConnectionKey(key)) return false;
  return isAdaptiveEnabledForServer(
    normalizeAdaptiveConnections(adaptiveConnections),
    ADAPTIVE_SERVER_BY_CONTROL_KEY[key],
  );
}

// Texto auxiliar del control bloqueado.
export const ADAPTIVE_MANAGED_HINT =
  'Administrado automáticamente: Conexiones adaptativas elige el nivel según el rendimiento. Tu valor se conserva y solo se usa si lo desactivas para este servidor.';

// Id del aviso, para enlazarlo al select con aria-describedby.
export function managedHintId(key: AdaptiveManagedConnectionKey): string {
  return `${key}-managed-hint`;
}

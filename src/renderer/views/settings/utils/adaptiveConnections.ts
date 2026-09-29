// Relación entre Conexiones adaptativas y los controles manuales de conexiones.
// El modo adaptativo sustituye la concurrencia de los servidores que consumen el
// handle por intento (MediaFire, MP4Upload, Voe, Mega): con Adaptive activo su
// valor manual pasa a ser solo la semilla y la app decide el resto. HLS queda
// fuera a propósito: su engine lee `hlsConnections` tal cual y el handle
// adaptativo no lo mueve, así que su control manual sigue mandando.

export const ADAPTIVE_MANAGED_CONNECTION_KEYS = [
  'mediafireConnections',
  'mp4uploadConnections',
  'voeConnections',
  'megaConnections',
] as const;

export type AdaptiveManagedConnectionKey = (typeof ADAPTIVE_MANAGED_CONNECTION_KEYS)[number];

export function isAdaptiveManagedConnectionKey(key: string): key is AdaptiveManagedConnectionKey {
  return (ADAPTIVE_MANAGED_CONNECTION_KEYS as readonly string[]).includes(key);
}

// Un control queda bloqueado solo con Adaptive activo y si es de los que él
// gobierna. El valor guardado no se toca nunca aquí: eso es cosa de settings.
export function isConnectionControlLocked(key: string, adaptiveConnections: unknown): boolean {
  return adaptiveConnections === true && isAdaptiveManagedConnectionKey(key);
}

// Texto auxiliar del control bloqueado.
export const ADAPTIVE_MANAGED_HINT = 'Administrado automáticamente mientras Conexiones adaptativas está activado.';

// Id del aviso, para enlazarlo al select con aria-describedby.
export function managedHintId(key: AdaptiveManagedConnectionKey): string {
  return `${key}-managed-hint`;
}

import { resolveServerOrderList } from '../../../../utils/serverUtils';

/**
 * Orden de servidores de un proveedor.
 *
 * La lista de candidatos vive en `utils/serverUtils` (fuente única) para que AnimeAV1 y JkAnime
 * no puedan mezclarse: cada proveedor solo ve los suyos y guarda su propio orden.
 */
export interface ServerOrderView {
  /** Servidores activos, en el orden que eligió el usuario. */
  active: string[];
  /** Servidores del proveedor que están apagados ("se saltan"), en orden de candidato. */
  inactive: string[];
}

/**
 * Separa los servidores de un proveedor en activos e inactivos.
 * Usa el mismo saneo que el dominio, así la UI muestra exactamente lo que se aplicará.
 */
export function splitServerOrder(
  candidates: readonly string[],
  stored: unknown,
  fallback: readonly string[],
): ServerOrderView {
  const resolved = resolveServerOrderList(stored, fallback, candidates);
  const seen = new Set<string>();
  const active = resolved.filter((name) => {
    if (!candidates.includes(name) || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  const inactive = candidates.filter((name) => !seen.has(name));
  return { active, inactive };
}

/**
 * Activa o desactiva un servidor.
 * Desactivar conserva el orden del resto; activar lo añade al final. Nunca reordena lo que ya
 * estaba: el orden lo pone el usuario.
 */
export function applyServerToggle(candidates: readonly string[], active: readonly string[], name: string): string[] {
  if (!candidates.includes(name)) return [...active];
  if (active.includes(name)) return active.filter((entry) => entry !== name);
  return [...active, name];
}

/** Mueve un servidor activo de una posición a otra. Devuelve copia, nunca muta la entrada. */
export function applyServerMove(active: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= active.length || to >= active.length) return [...active];
  const next = [...active];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

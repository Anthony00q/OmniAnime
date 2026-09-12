// Heurística de mensaje offline: solo con offline explícito, nunca por vacío solo.
export function shouldShowOfflineEmpty(itemCount: number, isOnline: boolean | null | undefined): boolean {
  return itemCount === 0 && isOnline === false;
}

import { useDeferredValue } from 'react';
import { useAtomValue } from 'jotai';
import { activeProviderAtom } from '@/renderer/store/atoms';

export function ensureIpcSuccess<T>(result: T): T {
  if (result === false) {
    throw new Error('La operación no se pudo completar');
  }

  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    const error =
      'error' in result && typeof result.error === 'string' ? result.error : 'La operación no se pudo completar';
    throw new Error(error);
  }

  return result;
}

// Datos diferidos: el indicador pinta urgente, las listas confirman despues.
export function useDeferredProvider(): string {
  return useDeferredValue(useAtomValue(activeProviderAtom));
}

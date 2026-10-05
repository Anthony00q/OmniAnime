import { useDeferredValue } from 'react';
import { useAtomValue } from 'jotai';
import { activeProviderAtom } from '@/renderer/store/atoms';

// Datos diferidos: el indicador pinta urgente, las listas confirman despues.
export function useDeferredProvider(): string {
  return useDeferredValue(useAtomValue(activeProviderAtom));
}

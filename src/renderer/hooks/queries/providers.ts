import { useCallback, useEffect, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activeProviderAtom, providerChangedCounterAtom } from '@/renderer/store/atoms';
import { unwrap } from './unwrap';

export interface ProviderOption {
  id: string;
  name: string;
}

export function useActiveProvider() {
  return useQuery({
    queryKey: ['active-provider'],
    queryFn: async () => unwrap(await window.api.invoke('get-active-provider')) as string,
    staleTime: Infinity,
  });
}

export function useProvidersList(): ProviderOption[] {
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    window.api
      .invoke('get-providers')
      .then((res) => setProviders(unwrap(res)))
      .catch(() => {});
  }, []);

  return providers;
}

// Optimista: pinta el indicador en el mismo frame y persiste en background.
export function useProviderSwitch(): (id: string) => void {
  const queryClient = useQueryClient();
  const [activeProvider, setActiveProvider] = useAtom(activeProviderAtom);
  const setProviderChanged = useSetAtom(providerChangedCounterAtom);

  return useCallback(
    (id: string) => {
      if (id === activeProvider) return;
      const prev = activeProvider;
      const startFlow = () => {
        setActiveProvider(id);
        queryClient.setQueryData(['active-provider'], id);
        setProviderChanged((c) => c + 1);
        window.dispatchEvent(new Event('provider-changed'));
        // Cancela peticiones en vuelo del proveedor anterior: con provider explícito ya
        // no contaminan, solo ahorra red. Sin await: la latencia no vuelve al indicador.
        void queryClient.cancelQueries({ queryKey: ['home'] }).catch(() => {});
        void queryClient.cancelQueries({ queryKey: ['schedule'] }).catch(() => {});
        void queryClient.cancelQueries({ queryKey: ['catalog'] }).catch(() => {});
        void queryClient.cancelQueries({ queryKey: ['search'] }).catch(() => {});
        void queryClient.cancelQueries({ queryKey: ['filters'] }).catch(() => {});
        void queryClient.cancelQueries({ queryKey: ['details'] }).catch(() => {});
        const rollbackIfStale = () => {
          if (queryClient.getQueryData(['active-provider']) !== id) return;
          setActiveProvider(prev);
          queryClient.setQueryData(['active-provider'], prev);
        };
        void window.api
          .invoke('set-active-provider', id)
          .then((res) => unwrap(res, { toast: false }))
          .catch(rollbackIfStale);
      };
      // El flujo arranca tras pintar el deslizamiento del indicador (160ms): el render
      // pesado de las listas no debe comerse ese frame. Timer simple, corre aunque la ventana esté oculta.
      setTimeout(startFlow, 250);
    },
    [activeProvider, queryClient, setActiveProvider, setProviderChanged],
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activeProviderAtom, providerChangedCounterAtom } from '@/renderer/store/atoms';

export interface ProviderOption {
  id: string;
  name: string;
}

export function useActiveProvider() {
  return useQuery({
    queryKey: ['active-provider'],
    queryFn: () => window.api.invoke('get-active-provider') as Promise<string>,
    staleTime: Infinity,
  });
}

export function useProvidersList(): ProviderOption[] {
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    window.api
      .invoke('get-providers')
      .then(setProviders)
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
      setActiveProvider(id);
      queryClient.setQueryData(['active-provider'], id);
      setProviderChanged((c) => c + 1);
      window.dispatchEvent(new Event('provider-changed'));
      // Cancela peticiones en vuelo del proveedor anterior: con provider
      // explícito por petición ya no contaminan, esto solo ahorra red.
      // Sin await para no devolver la latencia al indicador (optimista).
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
        .then((result) => {
          if (result === false) rollbackIfStale();
        })
        .catch(rollbackIfStale);
    },
    [activeProvider, queryClient, setActiveProvider, setProviderChanged],
  );
}

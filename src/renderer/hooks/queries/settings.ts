import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrap } from './unwrap';

export function useLoadSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => unwrap(await window.api.invoke('get-settings')),
    staleTime: Infinity,
  });
}

// Lectura puntual para acciones (restaurar valores por defecto): sin query.
export function fetchDefaultSettings(): Promise<any> {
  return window.api.invoke('get-default-settings').then(unwrap);
}

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) => unwrap(await window.api.invoke('save-settings', settings)),
    onSuccess: (_result, settings) => {
      queryClient.setQueryData(['settings'], settings);
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      queryClient.invalidateQueries({ queryKey: ['app-paths'] });
    },
  });
}

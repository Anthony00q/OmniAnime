import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureIpcSuccess } from './internal';

export function useLoadSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => window.api.invoke('get-settings'),
    staleTime: Infinity,
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) =>
      ensureIpcSuccess(await window.api.invoke('save-settings', settings)),
    onSuccess: (_result, settings) => {
      queryClient.setQueryData(['settings'], settings);
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      queryClient.invalidateQueries({ queryKey: ['app-paths'] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ensureIpcSuccess } from './internal';

export function useHistory(isActive: boolean) {
  const queryClient = useQueryClient();
  const previousActive = useRef(isActive);

  const query = useQuery({
    queryKey: ['history'],
    queryFn: () => window.api.invoke('get-download-history'),
    enabled: isActive,
    staleTime: 10 * 1000,
  });

  useEffect(() => {
    const handleHistoryUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ['history'], refetchType: 'active' });
    };

    window.api.on('history-updated', handleHistoryUpdated);
    return () => {
      window.api.removeListener('history-updated', handleHistoryUpdated);
    };
  }, [queryClient]);

  useEffect(() => {
    const becameActive = isActive && !previousActive.current;
    previousActive.current = isActive;
    if (!becameActive) return;

    void queryClient.refetchQueries({ queryKey: ['history'], type: 'active' }, { cancelRefetch: false });
  }, [isActive, queryClient]);

  return { ...query, invalidateHistory: () => queryClient.invalidateQueries({ queryKey: ['history'] }) };
}

export function useHistoryActions() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['history'] });

  return {
    clearHistory: useMutation({
      mutationFn: async () => ensureIpcSuccess(await window.api.invoke('clear-download-history')),
      onSuccess: invalidate,
    }),
    removeHistoryEntries: useMutation({
      mutationFn: async (payload: { indices: number[]; expectedIds?: number[] }) =>
        ensureIpcSuccess(await window.api.invoke('remove-history-entries', payload.indices, payload.expectedIds)),
      onSuccess: invalidate,
    }),
    invalidateHistory: invalidate,
  };
}

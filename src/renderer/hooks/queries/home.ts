import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ScheduleData } from '@/types/anime';
import { useDeferredProvider } from './internal';

export function useHomeData() {
  const provider = useDeferredProvider();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ['home', provider],
    queryFn: () => window.api.invoke('get-home-data', { force: false, provider }),
    staleTime: 4 * 60 * 1000,
  });

  const refresh = () => {
    setIsRefreshing(true);
    window.api
      .invoke('get-home-data', { force: true, provider })
      .then((data: any) => {
        queryClient.setQueryData(['home', provider], data);
      })
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: ['home', provider] });
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  return { ...query, refresh, isRefreshing };
}

export function useSchedule() {
  const provider = useDeferredProvider();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const query = useQuery<ScheduleData>({
    queryKey: ['schedule', provider],
    queryFn: async () => {
      const data = (await window.api.invoke('get-schedule', { force: false, provider })) as ScheduleData | null;
      if (!data) throw new Error('No se pudo cargar el horario');
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });

  const refresh = () => {
    setIsRefreshing(true);
    window.api
      .invoke('get-schedule', { force: true, provider })
      .then((data: ScheduleData | null) => {
        if (!data) throw new Error('No se pudo cargar el horario');
        queryClient.setQueryData(['schedule', provider], data);
      })
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: ['schedule', provider] });
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  return { ...query, refresh, isRefreshing };
}

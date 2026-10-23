import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScheduleData } from '@/types/anime';
import { useDeferredProvider } from './internal';
import { unwrap } from './unwrap';

export function useHomeData() {
  const provider = useDeferredProvider();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['home', provider],
    queryFn: async () => unwrap(await window.api.invoke('get-home-data', { force: false, provider })),
    staleTime: 4 * 60 * 1000,
  });

  const refresh = async () => {
    await queryClient.cancelQueries({ queryKey: ['home', provider], exact: true });
    const data = unwrap(await window.api.invoke('get-home-data', { force: true, provider }), { toast: false });
    if (!data) throw new Error('No se pudieron actualizar los episodios');
    queryClient.setQueryData(['home', provider], data);
    return data;
  };

  return { ...query, refresh };
}

export function useSchedule() {
  const provider = useDeferredProvider();
  const queryClient = useQueryClient();

  const query = useQuery<ScheduleData>({
    queryKey: ['schedule', provider],
    queryFn: async () => {
      const data = unwrap(await window.api.invoke('get-schedule', { force: false, provider })) as ScheduleData | null;
      if (!data) throw new Error('No se pudo cargar el horario');
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });

  const refresh = async () => {
    await queryClient.cancelQueries({ queryKey: ['schedule', provider], exact: true });
    const data = unwrap<ScheduleData | null>(await window.api.invoke('get-schedule', { force: true, provider }), {
      toast: false,
    });
    if (!data) throw new Error('No se pudo actualizar la programación');
    queryClient.setQueryData(['schedule', provider], data);
    return data;
  };

  return { ...query, refresh };
}

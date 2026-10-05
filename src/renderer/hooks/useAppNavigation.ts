import { useCallback } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { pendingCatalogGenreAtom, selectedAnimeAtom } from '@/renderer/store/atoms';
import { viewIdFromPath, viewPath, type ViewId } from '@/renderer/utils/viewRoutes';
import type { HistoryState } from '@tanstack/history';

// Lo que viaja en la entrada de historial: a qué vista vuelve "Volver" de la
// ficha y si el catálogo debe enfocar su buscador al entrar.
declare module '@tanstack/history' {
  interface HistoryState {
    from?: ViewId;
    focusSearch?: boolean;
  }
}

export interface AppNavigation {
  setView: (view: string) => void;
  openAnime: (slug: string) => void;
  navigateToCatalog: (genre?: string) => void;
  setSettingsTab: (tab: string) => void;
  detailsBack: () => void;
}

// Única vía de navegación del renderer. El origen de "Volver" viaja en el estado
// de cada entrada de historial, no en un átomo; sin origen, al inicio.
export function useAppNavigation(): AppNavigation {
  const router = useRouter();
  const getSelectedAnime = useAtomCallback((get) => get(selectedAnimeAtom));
  const setSelectedAnime = useSetAtom(selectedAnimeAtom);
  const setPendingGenre = useSetAtom(pendingCatalogGenreAtom);

  const stateOf = useCallback((): HistoryState => {
    return router.state.location.state ?? {};
  }, [router]);

  const fromFor = useCallback(
    (...skip: ViewId[]): ViewId | undefined => {
      const current = viewIdFromPath(router.state.location.pathname);
      if (current && !skip.includes(current)) return current;
      return stateOf().from;
    },
    [router, stateOf],
  );
  const setView = useCallback(
    (view: string) => {
      const from = fromFor('details', 'settings');
      if (view === 'details') {
        const slug = getSelectedAnime();
        if (slug) {
          void router.navigate({ to: '/anime/$id', params: { id: slug }, state: { from } });
        } else {
          void router.navigate({ to: '/anime', state: { from } });
        }
        return;
      }
      const path = viewPath(view);
      if (path) void router.navigate({ to: path, state: { from } });
    },
    [fromFor, getSelectedAnime, router],
  );

  const openAnime = useCallback(
    (slug: string) => {
      setSelectedAnime(slug);
      void router.navigate({ to: '/anime/$id', params: { id: slug }, state: { from: fromFor('details') } });
    },
    [fromFor, router, setSelectedAnime],
  );

  const navigateToCatalog = useCallback(
    (genre?: string) => {
      if (genre) setPendingGenre(genre);
      const from = fromFor('catalog', 'details', 'settings');
      // Sobre el propio catálogo se reemplaza la entrada: Ctrl+F reenfoca sin
      // ensuciar el historial con visitas repetidas.
      const replace = viewIdFromPath(router.state.location.pathname) === 'catalog';
      void router.navigate({ to: '/catalog', replace, state: { from, focusSearch: true } });
    },
    [fromFor, router, setPendingGenre],
  );

  const setSettingsTab = useCallback(
    (tab: string) => {
      // Cambiar de pestaña reemplaza la entrada: atrás sale de Ajustes en vez de
      // recorrer las pestañas ya visitadas.
      const state = { from: router.state.location.state.from };
      if (tab === 'sistema') {
        void router.navigate({ to: '/settings', replace: true, state });
      } else {
        void router.navigate({ to: '/settings/$tab', params: { tab }, replace: true, state });
      }
    },
    [router],
  );

  const detailsBack = useCallback(() => {
    setSelectedAnime(null);
    const path = viewPath(stateOf().from ?? 'home');
    void router.navigate({ to: path ?? '/' });
  }, [router, setSelectedAnime, stateOf]);

  return { setView, openAnime, navigateToCatalog, setSettingsTab, detailsBack };
}

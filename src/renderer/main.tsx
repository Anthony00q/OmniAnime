import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createStore, Provider as JotaiProvider } from 'jotai';
import App from './App';
import './index.css';
import { activeProviderAtom } from './store/atoms';
import { DEFAULT_CATALOG_FILTERS } from './utils/catalogFilters';
import { adaptLibraryPreloadToFolders } from './utils/libraryPreload';

interface PreloadedRendererData {
  providerId?: unknown;
  home?: unknown;
  filters?: unknown;
  catalog?: unknown;
  libraryMeta?: unknown;
}

function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

async function bootstrap(): Promise<void> {
  const queryClient = createAppQueryClient();
  const store = createStore();
  let preloaded: PreloadedRendererData | null = null;

  try {
    preloaded = (await window.api.invoke('get-preloaded-data')) as PreloadedRendererData | null;
  } catch {
    // The active-provider query below remains the fallback for startup errors.
  }

  const KNOWN_PROVIDERS = new Set(['animeav1', 'jkanime']);
  const cleanProviderId = (raw: unknown): string => {
    const id = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return KNOWN_PROVIDERS.has(id) ? id : '';
  };
  let providerId = cleanProviderId(preloaded?.providerId);
  if (!providerId) {
    try {
      providerId = cleanProviderId(await window.api.invoke('get-active-provider'));
    } catch {
      // Queries remain responsible for recovering if startup data is unavailable.
    }
  }

  if (providerId) {
    store.set(activeProviderAtom, providerId);
    // Sin siembra de ['active-provider']: la query hace un fetch vivo al montar
    // y así una semilla envenenada no queda clavada para siempre (stale Infinity).

    if (Array.isArray(preloaded?.home)) {
      queryClient.setQueryData(['home', providerId], preloaded.home);
    }

    if (preloaded?.filters) {
      queryClient.setQueryData(['filters', providerId], preloaded.filters);
    }

    if (Array.isArray(preloaded?.catalog)) {
      queryClient.setQueryData(['catalog', providerId, DEFAULT_CATALOG_FILTERS], {
        pages: [preloaded.catalog],
        pageParams: [1],
      });
    }
  }

  // Librería instantánea: siembra ['library', dirs] con el preload del splash
  // (filas completas: ver buildLibraryMetaPreload). Si el preload viene vacío
  // o degradado, no se siembra y useLibrary carga lazy como antes.
  try {
    if (Array.isArray(preloaded?.libraryMeta) && preloaded.libraryMeta.length > 0) {
      const settings = (await window.api.invoke('get-settings').catch(() => null)) as {
        outputDirs?: unknown;
        defaultOutputDir?: unknown;
      } | null;
      const configured = Array.isArray(settings?.outputDirs)
        ? (settings.outputDirs as unknown[]).filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
        : [];
      const dirs =
        configured.length > 0
          ? configured.slice(0, 3)
          : typeof settings?.defaultOutputDir === 'string' && settings.defaultOutputDir
            ? [settings.defaultOutputDir as string]
            : [];
      if (dirs.length > 0) {
        const folders = adaptLibraryPreloadToFolders(preloaded.libraryMeta).filter((f) => dirs.includes(f.sourceDir));
        if (folders.length > 0) {
          queryClient.setQueryData(['library', dirs], folders);
        }
      }
    }
  } catch {
    // La vista de librería sigue funcionando con carga lazy.
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <JotaiProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </JotaiProvider>
    </React.StrictMode>,
  );

  // Handoff del splash: avisar al main cuando home está listo para pintar sin
  // skeleton. Con tope para no retener el splash si la red falla.
  void (async () => {
    const signal = (): void => {
      try {
        void (window.api.invoke('renderer-ready') as Promise<unknown>).catch(() => undefined);
      } catch {}
    };
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (providerId) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 2500) {
          const home = queryClient.getQueryData(['home', providerId]) as unknown;
          if (Array.isArray(home) && home.length > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      }
    } finally {
      signal();
    }
  })();
}

void bootstrap();

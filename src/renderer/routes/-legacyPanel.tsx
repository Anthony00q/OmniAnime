import { useAtomValue } from 'jotai';
import {
  MemoAnimeDetailsView,
  MemoCatalogView,
  MemoHistoryView,
  MemoHomeView,
  MemoLibraryView,
  MemoSettingsView,
  useAppShell,
} from '@/renderer/App';
import { activeProviderAtom } from '@/renderer/store/atoms';

export type LegacyView = 'home' | 'catalog' | 'details' | 'history' | 'library' | 'settings';

// Contenido de las vistas que aún no tienen ruta propia: mismo render que les
// daba el shell, con los mismos props.
export function LegacyPanel({ view, slug }: { view: LegacyView; slug?: string }) {
  const { onSelectAnime, onDetailsBack } = useAppShell();
  const activeProvider = useAtomValue(activeProviderAtom);

  switch (view) {
    case 'home':
      return <MemoHomeView />;
    case 'catalog':
      return <MemoCatalogView />;
    case 'details':
      return <MemoAnimeDetailsView slug={slug ?? ''} onBack={onDetailsBack} onSelectAnime={onSelectAnime} />;
    case 'history':
      return <MemoHistoryView activeProvider={activeProvider} onSelectAnime={onSelectAnime} />;
    case 'library':
      return <MemoLibraryView onSelectAnime={onSelectAnime} activeProvider={activeProvider} />;
    case 'settings':
      return <MemoSettingsView />;
  }
}

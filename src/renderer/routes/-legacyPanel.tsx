import { MemoAnimeDetailsView, MemoSettingsView, useAppShell } from '@/renderer/App';

export type LegacyView = 'details' | 'settings';

// Contenido de las vistas que aún no tienen ruta propia: mismo render que les
// daba el shell, con los mismos props.
export function LegacyPanel({ view, slug }: { view: LegacyView; slug?: string }) {
  const { onSelectAnime, onDetailsBack } = useAppShell();

  switch (view) {
    case 'details':
      return <MemoAnimeDetailsView slug={slug ?? ''} onBack={onDetailsBack} onSelectAnime={onSelectAnime} />;
    case 'settings':
      return <MemoSettingsView />;
  }
}

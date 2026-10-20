import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoAnimeDetailsView, useAppShell } from '@/renderer/App';
import { useAnimeDetailsRoute } from '@/renderer/hooks/useAppNavigation';

export const Route = createFileRoute('/anime/')({
  component: AnimeEmptyRoute,
});

// Sin ficha seleccionada: la vista muestra su estado vacío.
function AnimeEmptyRoute() {
  const details = useAnimeDetailsRoute('');
  const { onSelectAnime, onDetailsBack } = useAppShell();
  return (
    <ViewPanel scope="ui:details" titlebarOffset={false}>
      <MemoAnimeDetailsView
        key={`${details.provider}:${details.slug}`}
        isActive
        slug={details.slug}
        onBack={onDetailsBack}
        onSelectAnime={onSelectAnime}
      />
    </ViewPanel>
  );
}

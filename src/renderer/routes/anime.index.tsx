import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoAnimeDetailsView, useAppShell } from '@/renderer/App';

export const Route = createFileRoute('/anime/')({
  component: AnimeEmptyRoute,
});

// Sin ficha seleccionada: la vista muestra su estado vacío.
function AnimeEmptyRoute() {
  const { onSelectAnime, onDetailsBack } = useAppShell();
  return (
    <ViewPanel scope="ui:details" titlebarOffset={false}>
      <MemoAnimeDetailsView isActive slug="" onBack={onDetailsBack} onSelectAnime={onSelectAnime} />
    </ViewPanel>
  );
}

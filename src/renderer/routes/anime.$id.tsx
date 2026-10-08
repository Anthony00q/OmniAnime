import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoAnimeDetailsView, useAppShell } from '@/renderer/App';

export const Route = createFileRoute('/anime/$id')({
  component: AnimeDetailsRoute,
});

function AnimeDetailsRoute() {
  const { id } = Route.useParams();
  const { onSelectAnime, onDetailsBack } = useAppShell();
  return (
    <ViewPanel scope="ui:details" titlebarOffset={false} animateEntry={false}>
      <MemoAnimeDetailsView isActive slug={id} onBack={onDetailsBack} onSelectAnime={onSelectAnime} />
    </ViewPanel>
  );
}

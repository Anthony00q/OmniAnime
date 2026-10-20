import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoAnimeDetailsView, useAppShell } from '@/renderer/App';
import { useAnimeDetailsRoute } from '@/renderer/hooks/useAppNavigation';

export const Route = createFileRoute('/anime/$id')({
  component: AnimeDetailsRoute,
});

function AnimeDetailsRoute() {
  const { id } = Route.useParams();
  const details = useAnimeDetailsRoute(id);
  const { onSelectAnime, onDetailsBack } = useAppShell();
  return (
    <ViewPanel scope="ui:details" titlebarOffset={false} animateEntry={false}>
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

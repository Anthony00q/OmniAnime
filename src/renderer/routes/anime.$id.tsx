import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/anime/$id')({
  component: AnimeDetailsRoute,
});

function AnimeDetailsRoute() {
  const { id } = Route.useParams();
  return (
    <ViewPanel scope="ui:details" titlebarOffset={false}>
      <LegacyPanel view="details" slug={id} />
    </ViewPanel>
  );
}

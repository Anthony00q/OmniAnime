import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/anime/')({
  component: AnimeEmptyRoute,
});

function AnimeEmptyRoute() {
  return (
    <ViewPanel scope="ui:details" titlebarOffset={false}>
      <LegacyPanel view="details" slug="" />
    </ViewPanel>
  );
}

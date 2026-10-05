import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/')({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <ViewPanel scope="ui:home">
      <LegacyPanel view="home" />
    </ViewPanel>
  );
}

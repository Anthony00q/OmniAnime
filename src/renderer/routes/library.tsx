import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/library')({
  component: LibraryRoute,
});

function LibraryRoute() {
  return (
    <ViewPanel scope="ui:library" titlebarOffset={false}>
      <LegacyPanel view="library" />
    </ViewPanel>
  );
}

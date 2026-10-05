import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/catalog')({
  component: CatalogRoute,
});

function CatalogRoute() {
  return (
    <ViewPanel scope="ui:catalog">
      <LegacyPanel view="catalog" />
    </ViewPanel>
  );
}

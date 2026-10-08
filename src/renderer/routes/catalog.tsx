import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoCatalogView } from '@/renderer/App';

export const Route = createFileRoute('/catalog')({
  component: CatalogRoute,
});

function CatalogRoute() {
  return (
    <ViewPanel scope="ui:catalog" animateEntry={false}>
      <MemoCatalogView />
    </ViewPanel>
  );
}

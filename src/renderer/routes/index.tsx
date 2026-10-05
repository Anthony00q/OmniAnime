import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoHomeView } from '@/renderer/App';

export const Route = createFileRoute('/')({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <ViewPanel scope="ui:home">
      <MemoHomeView />
    </ViewPanel>
  );
}

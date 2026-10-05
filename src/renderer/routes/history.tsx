import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/history')({
  component: HistoryRoute,
});

function HistoryRoute() {
  return (
    <ViewPanel scope="ui:history">
      <LegacyPanel view="history" />
    </ViewPanel>
  );
}

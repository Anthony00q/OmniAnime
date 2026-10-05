import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoScheduleView } from '@/renderer/App';

export const Route = createFileRoute('/schedule')({
  component: ScheduleRoute,
});

function ScheduleRoute() {
  return (
    <ViewPanel scope="ui:schedule">
      <MemoScheduleView />
    </ViewPanel>
  );
}

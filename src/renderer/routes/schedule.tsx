import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/schedule')({
  component: ScheduleRoute,
});

function ScheduleRoute() {
  return (
    <ViewPanel scope="ui:schedule">
      <LegacyPanel view="schedule" />
    </ViewPanel>
  );
}

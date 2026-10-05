import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { LegacyPanel } from './-legacyPanel';

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <ViewPanel scope="ui:settings">
      <LegacyPanel view="settings" />
    </ViewPanel>
  );
}

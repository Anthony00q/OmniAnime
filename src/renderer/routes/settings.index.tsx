import { createFileRoute } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoSettingsView } from '@/renderer/App';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';

export const Route = createFileRoute('/settings/')({
  component: SettingsRoute,
});

function SettingsRoute() {
  const { setSettingsTab } = useAppNavigation();
  return (
    <ViewPanel scope="ui:settings">
      <MemoSettingsView onTabChange={setSettingsTab} />
    </ViewPanel>
  );
}

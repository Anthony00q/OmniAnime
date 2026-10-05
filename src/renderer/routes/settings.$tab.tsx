import { createFileRoute, Navigate } from '@tanstack/react-router';
import { ViewPanel } from '@/renderer/components/ViewPanel';
import { MemoSettingsView } from '@/renderer/App';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';
import { SETTINGS_TAB_IDS } from '@/renderer/views/settings/components/SettingsTabNav';

export const Route = createFileRoute('/settings/$tab')({
  component: SettingsTabRoute,
});

function SettingsTabRoute() {
  const { tab } = Route.useParams();
  const { setSettingsTab } = useAppNavigation();

  // Una pestaña desconocida no deja Ajustes en blanco: se vuelve a su inicio.
  if (!SETTINGS_TAB_IDS.includes(tab)) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <ViewPanel scope="ui:settings">
      <MemoSettingsView activeTab={tab} onTabChange={setSettingsTab} />
    </ViewPanel>
  );
}

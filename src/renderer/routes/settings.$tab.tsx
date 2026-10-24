import { useLayoutEffect } from 'react';
import { createFileRoute, Navigate, useLocation } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { lastSettingsTabAtom } from '@/renderer/store/atoms';
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
  const pathname = useLocation({ select: (location) => location.pathname });
  const rememberTab = useSetAtom(lastSettingsTabAtom);
  const isValidTab = SETTINGS_TAB_IDS.includes(tab);

  useLayoutEffect(() => {
    if (isValidTab && pathname.replace(/\/+$/, '') === `/settings/${tab}`) rememberTab(tab);
  }, [isValidTab, pathname, tab, rememberTab]);

  if (!isValidTab) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <ViewPanel scope="ui:settings" animateEntry={false}>
      <MemoSettingsView activeTab={tab} onTabChange={setSettingsTab} />
    </ViewPanel>
  );
}

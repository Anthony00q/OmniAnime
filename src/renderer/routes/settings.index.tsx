import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { lastSettingsTabAtom } from '@/renderer/store/atoms';

export const Route = createFileRoute('/settings/')({
  component: SettingsRoute,
});

function SettingsRoute() {
  const tab = useAtomValue(lastSettingsTabAtom);
  return <Navigate to="/settings/$tab" params={{ tab }} replace />;
}

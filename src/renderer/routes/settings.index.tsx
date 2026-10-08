import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/')({
  component: SettingsRoute,
});

// La vista vive en /settings/$tab: aquí solo se aterriza en la pestaña por defecto.
function SettingsRoute() {
  return <Navigate to="/settings/$tab" params={{ tab: 'sistema' }} replace />;
}

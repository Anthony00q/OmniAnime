import { createRootRoute, Navigate } from '@tanstack/react-router';
import App from '@/renderer/App';

export const Route = createRootRoute({
  component: App,
  // Una URL rota no deja la app en blanco: se devuelve al inicio.
  notFoundComponent: () => <Navigate to="/" replace />,
});

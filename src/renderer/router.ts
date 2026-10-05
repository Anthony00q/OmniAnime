import { createHashHistory, createRouter } from '@tanstack/react-router';
import { routeTree } from './routes/routeTree.gen';

// Historial por hash: en producción la app carga por file:// y pushState con
// rutas falla en un documento de origen null; el hash da URL directa y atrás.
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

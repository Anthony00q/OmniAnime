import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/downloader')({
  // La cola vive montada en el shell (hidden) para conservar su scroll y su
  // estado; la ruta solo da URL e historial.
  component: () => null,
});

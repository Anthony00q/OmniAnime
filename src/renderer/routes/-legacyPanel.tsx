import { MemoSettingsView } from '@/renderer/App';

export type LegacyView = 'settings';

// Contenido de las vistas que aún no tienen ruta propia: mismo render que les
// daba el shell, con los mismos props.
export function LegacyPanel({ view }: { view: LegacyView }) {
  switch (view) {
    case 'settings':
      return <MemoSettingsView />;
  }
}

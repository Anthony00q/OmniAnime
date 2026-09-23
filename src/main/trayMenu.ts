import * as path from 'path';
import type { MenuItemConstructorOptions } from 'electron';

export interface TrayMenuState {
  isWindowVisible: boolean;
  appVersion: string;
}

export interface TrayMenuActions {
  onToggleVisibility: () => void;
  onQuit: () => void;
}

// Menú nativo de Windows: solo estructura, sin estilos. Se reconstruye
// en show/hide; con el menú abierto lo cerraría.
export function buildTrayMenuTemplate(state: TrayMenuState, actions: TrayMenuActions): MenuItemConstructorOptions[] {
  const header = state.appVersion ? `OmniAnime ${state.appVersion}` : 'OmniAnime';
  return [
    { label: header, enabled: false },
    { type: 'separator' },
    {
      label: state.isWindowVisible ? 'Ocultar OmniAnime' : 'Mostrar OmniAnime',
      click: () => actions.onToggleVisibility(),
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => actions.onQuit(),
    },
  ];
}

// PNG dedicado de 32px; si falta, el ICO.
export function resolveTrayIconPath(appPath: string, exists: (p: string) => boolean): string {
  const dedicated = path.join(appPath, 'assets', 'tray-icon-32.png');
  if (exists(dedicated)) return dedicated;
  return path.join(appPath, 'assets', 'icon.ico');
}

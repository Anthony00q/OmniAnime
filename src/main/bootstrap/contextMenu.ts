import { app, BrowserWindow, Menu, MenuItem } from 'electron';

export function setupContextMenu(): void {
  app.on('web-contents-created', (_, contents) => {
    contents.on('context-menu', (_e, params) => {
      const menu = new Menu();
      if (params.isEditable) {
        menu.append(new MenuItem({ role: 'undo', label: 'Deshacer' }));
        menu.append(new MenuItem({ role: 'redo', label: 'Rehacer' }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ role: 'cut', label: 'Cortar' }));
        menu.append(new MenuItem({ role: 'copy', label: 'Copiar' }));
        menu.append(new MenuItem({ role: 'paste', label: 'Pegar' }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ role: 'selectAll', label: 'Seleccionar todo' }));
      } else if (params.selectionText) {
        menu.append(new MenuItem({ role: 'copy', label: 'Copiar' }));
      }

      if (menu.items.length > 0) {
        menu.popup({ window: BrowserWindow.fromWebContents(contents) || undefined });
      }
    });
  });
}

import { expect, type Page } from '@playwright/test';

export type MeasuredView = 'Descargas' | 'Historial' | 'Ajustes';

export async function navigateToMeasuredView(page: Page, view: MeasuredView): Promise<void> {
  const button = page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: view, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
  const readyTitle = {
    Descargas: 'No hay descargas activas',
    Historial: 'Registro aún en blanco',
    Ajustes: 'Carpetas de descarga',
  }[view];
  await expect(
    page.getByRole(view === 'Ajustes' ? 'heading' : 'region', { name: readyTitle, exact: true }),
  ).toBeVisible();
  await page.evaluate(
    () => new Promise<void>((accept) => requestAnimationFrame(() => requestAnimationFrame(() => accept()))),
  );
}

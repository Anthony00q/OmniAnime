import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { navigateToMeasuredView } from './viewReady';

test('arranca aislado y el renderer invoca el IPC real', async ({ harness }) => {
  const response = await harness.page.evaluate(() => window.api.invoke('get-queue'));
  expect(response).toEqual({ ok: true, data: [] });
  expect(harness.errors).toEqual([]);
});

test('la sesión de Electron bloquea peticiones externas antes de contactar al proveedor', async ({ harness }) => {
  const blocked = await harness.electron.evaluate(async ({ net }) => {
    try {
      await net.fetch('https://example.invalid/fixture');
      return 'accepted';
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(blocked).toContain('ERR_BLOCKED_BY_CLIENT');
});

test('contextBridge retira solo la suscripción solicitada y bloquea entregas tardías', async ({ harness }) => {
  const page = harness.page;
  await page.evaluate(() => {
    const state = { first: 0, second: 0, dispose: () => {} };
    const first = window.api.on('queue-update', () => state.first++);
    const second = window.api.on('queue-update', () => state.second++);
    state.dispose = () => {
      first();
      first();
    };
    Object.assign(window, { __subscriptions: state, __disposeSecond: second });
  });
  const send = () =>
    harness.electron.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        if (window.getTitle() === 'OmniAnime') window.webContents.send('queue-update', []);
    });
  await send();
  const read = () =>
    page.evaluate(() => {
      const state = (window as unknown as { __subscriptions: { first: number; second: number } }).__subscriptions;
      return { first: state.first, second: state.second };
    });
  await expect.poll(read).toEqual({ first: 1, second: 1 });
  await page.evaluate(() => (window as unknown as { __subscriptions: { dispose(): void } }).__subscriptions.dispose());
  await send();
  await expect.poll(read).toEqual({ first: 1, second: 2 });
  await page.evaluate(() => (window as unknown as { __disposeSecond(): void }).__disposeSecond());
});

test('Ajustes conserva el borrador entre pestañas y Descartar recupera el valor', async ({ harness }) => {
  const page = harness.page;
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Minimizar a la bandeja al cerrar' });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Descartar cambios sin guardar' })).toBeVisible();
  await page.getByRole('button', { name: /Apariencia y UI/ }).click();
  await page.getByRole('button', { name: /^Sistema/ }).click();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('button', { name: 'Descartar cambios sin guardar' })).toBeVisible();
  await page.getByRole('button', { name: 'Descartar cambios sin guardar' }).click();
  await expect(page.getByRole('button', { name: 'Descartar cambios sin guardar' })).toHaveCount(0);
  await expect(toggle).not.toBeChecked();
  expect(harness.errors).toEqual([]);
});

test('la confirmación atrapa el foco y Escape cierra sin restablecer los ajustes', async ({ harness }) => {
  const page = harness.page;
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const restore = page.getByRole('button', { name: 'Restablecer', exact: true });
  await restore.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descartar cambios sin guardar' })).toHaveCount(0);
});

test('accesibilidad: informe del renderer y bloqueo de incidencias críticas', async ({ harness }, info) => {
  const result = await new AxeBuilder({ page: harness.page })
    .setLegacyMode()
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const report = info.outputPath('accessibility.json');
  await writeFile(report, JSON.stringify(result.violations, null, 2));
  await info.attach('accesibilidad', { path: report, contentType: 'application/json' });
  expect(result.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});

test('la medición espera al contenido de Historial, no solo a su botón activo', async ({ harness }) => {
  const { page } = harness;
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((accept) => {
    release = accept;
  });
  const seen = new Promise<void>((accept) => {
    requested = accept;
  });
  await page.route('**/HistoryView-*.js', async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  let ready = false;
  const navigation = navigateToMeasuredView(page, 'Historial').then(() => {
    ready = true;
  });
  try {
    await seen;
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Historial', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(ready).toBe(false);
  } finally {
    release();
    await navigation;
    await page.unroute('**/HistoryView-*.js');
  }
  await expect(page.getByRole('region', { name: 'Registro aún en blanco' })).toBeVisible();
});

import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { closeOwnedElectron, withResourceCleanup } from '../helpers/resources';

const workspace = resolve(__dirname, '../..');
const renderer = join(workspace, 'dist/renderer');

interface Harness {
  electron: ElectronApplication;
  page: Page;
  root: string;
  token: string;
  startupMs: number;
  errors: string[];
}

export const test = base.extend<{ harness: Harness }>({
  harness: async ({ playwright }, use, info) => {
    await stat(join(renderer, 'index.html')).catch(() => {
      throw new Error('Falta el build. Ejecuta npm run build antes de probar Electron.');
    });
    await stat(join(workspace, 'dist/main/main.js')).catch(() => {
      throw new Error('Falta el main compilado. Ejecuta npm run build.');
    });
    await withResourceCleanup(async (defer) => {
      const resources: { child?: ChildProcess; page?: Page } = {};
      let tracing = false;
      const tempParent = join(tmpdir(), 'opencode');
      await mkdir(tempParent, { recursive: true });
      const parent = await realpath(tempParent);
      const root = await mkdtemp(join(parent, 'omnianime-electron-'));
      defer(async () => {
        const child = resources.child;
        if (child && child.exitCode === null && child.signalCode === null) {
          throw new Error('El proceso de pruebas sigue vivo; se conserva su perfil temporal.');
        }
        if (dirname(root) !== parent || !root.startsWith(join(parent, 'omnianime-electron-'))) {
          throw new Error('No se elimina una raíz temporal ajena a esta ejecución.');
        }
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      });
      const token = randomUUID();
      await writeFile(join(root, 'harness.json'), JSON.stringify({ token }));
      const manifest = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'));
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'omnianime-test-harness',
          version: manifest.version,
          main: join(__dirname, 'bootstrap.cjs'),
        }),
      );
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      };
      const server = createServer(async (request, response) => {
        try {
          const pathname = decodeURIComponent(new URL(request.url || '/', 'http://fixture').pathname);
          const file = resolve(renderer, `.${pathname === '/' ? '/index.html' : pathname}`);
          const canonical = await realpath(file);
          const inside = relative(renderer, canonical);
          if (isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) {
            response.writeHead(403).end();
            return;
          }
          const body = await readFile(canonical);
          response.writeHead(200, {
            'Content-Type': types[extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
          });
          response.end(body);
        } catch {
          response.writeHead(404).end();
        }
      });
      defer(async () => {
        server.closeAllConnections();
        if (server.listening)
          await new Promise<void>((accept, reject) => server.close((error) => (error ? reject(error) : accept())));
      });
      const errors: string[] = [];
      const started = performance.now();
      await new Promise<void>((accept, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject);
          accept();
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No se pudo abrir el servidor aislado.');
      const url = `http://127.0.0.1:${address.port}`;
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key, value]) =>
            value !== undefined &&
            !/^(NODE_OPTIONS|ELECTRON_RUN_AS_NODE|OMNIANIME_.*|OMNI_TEST_.*|VITE_.*)$/i.test(key),
        ),
      ) as Record<string, string>;
      const electron = await playwright._electron.launch({
        args: [root],
        cwd: root,
        env: { ...env, OMNI_TEST_ROOT: root, OMNI_TEST_TOKEN: token, OMNIANIME_DEV_SERVER_URL: url },
        timeout: 30000,
      });
      const application = electron;
      const child = application.process();
      resources.child = child;
      defer(async () => {
        try {
          await closeOwnedElectron(child, () => application.evaluate(({ app }) => app.exit(0)));
        } finally {
          await application.close().catch((error) => {
            if (child.exitCode === null && child.signalCode === null) throw error;
          });
        }
      });
      defer(async () => {
        if (info.status !== info.expectedStatus) {
          if (resources.page) await resources.page.screenshot({ path: info.outputPath('failure.png') });
          if (tracing) await application.context().tracing.stop({ path: info.outputPath('trace.zip') });
        } else if (tracing) await application.context().tracing.stop();
      });
      await electron.context().tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracing = true;
      const observe = (window: Page) => window.on('pageerror', (error) => errors.push(error.message));
      electron.on('window', observe);
      electron.windows().forEach(observe);
      await expect
        .poll(() => electron!.windows().find((window) => window.url().startsWith(url)) !== undefined)
        .toBe(true);
      const page = electron.windows().find((window) => window.url().startsWith(url))!;
      resources.page = page;
      await page.setViewportSize({ width: 1300, height: 900 });
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
      await expect
        .poll(() =>
          electron!.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some(
              (window) => window.getTitle() === 'OmniAnime' && window.isVisible() && window.getOpacity() === 1,
            ),
          ),
        )
        .toBe(true);
      const isolated = await electron.evaluate(({ app }) => ({
        userData: app.getPath('userData'),
        downloads: app.getPath('downloads'),
        token: (globalThis as unknown as { __omniHarness: { token: string } }).__omniHarness.token,
        cwd: process.cwd(),
      }));
      expect(isolated).toEqual({
        userData: join(root, 'userData'),
        downloads: join(root, 'downloads'),
        token,
        cwd: root,
      });
      await use({ electron, page, root, token, startupMs: performance.now() - started, errors });
    });
  },
});

export { expect };

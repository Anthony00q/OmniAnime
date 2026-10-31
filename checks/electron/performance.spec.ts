import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect } from './fixtures';
import { navigateToMeasuredView, type MeasuredView } from './viewReady';

for (let run = 1; run <= 3; run++) {
  test(`cola grande: montaje cerrado y apertura (${run}/3)`, async ({ harness }, info) => {
    const { electron, page } = harness;
    const queue = Array.from({ length: 4 }, (_, index) => ({
      id: `synthetic-${index}`,
      slug: `synthetic-${index}`,
      animeTitle: `Serie sintética ${index + 1}`,
      episodes: Array.from({ length: 250 }, (_, episode) => episode + 1),
      status: 'paused',
      progress: 0.25,
      currentEp: null,
      providerId: 'animeav1',
      completedEps: [],
      failedEps: [],
      pausedEps: [],
      cancelledEps: [],
      targetPath: '',
    }));
    const started = performance.now();
    await electron.evaluate(({ BrowserWindow, ipcMain }, items) => {
      ipcMain.removeHandler('get-queue');
      ipcMain.handle('get-queue', () => ({ ok: true, data: items }));
      for (const window of BrowserWindow.getAllWindows())
        if (window.getTitle() === 'OmniAnime') window.webContents.send('queue-update', items);
    }, queue);
    await page.getByRole('button', { name: 'Descargas', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ver progreso por episodio' })).toHaveCount(4);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    const closedMs = performance.now() - started;
    const closedRows = await page.locator('.episode-list-item').count();
    expect(closedRows).toBe(0);
    const openedAt = performance.now();
    await page.getByRole('button', { name: 'Ver progreso por episodio' }).first().click();
    const panel = page.getByRole('region', { name: 'Progreso por episodio de Serie sintética 1', exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.episode-list-item')).toHaveCount(250);
    const openMs = performance.now() - openedAt;
    await page.getByRole('button', { name: 'Ocultar episodios', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Ver progreso por episodio' })).toHaveCount(4);
    const retainedRows = await page.locator('.episode-list-item').count();
    expect(retainedRows).toBe(250);
    await expect(page.getByRole('button', { name: 'Ver progreso por episodio' }).first()).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Ver progreso por episodio' }).first().click();
    await expect(panel).toBeVisible();
    await electron.evaluate(({ BrowserWindow }, item) => {
      for (const window of BrowserWindow.getAllWindows())
        if (window.getTitle() === 'OmniAnime')
          window.webContents.send('queue-progress', {
            id: item.id,
            status: 'downloading',
            progress: 0.5,
            currentEp: 3,
            currentServer: 'HLS',
            activeEps: [{ episode: 3, progress: 1, server: 'HLS', phase: 'assembling' }],
          });
    }, queue[0]);
    await expect(panel.locator('[data-ep-state="active"]')).toContainText('Preparando archivo');
    await expect(panel.locator('[data-ep-state="active"]')).toContainText('99%');
    expect(harness.errors).toEqual([]);
    const metrics = { scenario: 'synthetic-queue-4x250', run, closedMs, openMs, closedRows, retainedRows };
    const output = resolve('test-results/performance-audit');
    const label = (process.env.OMNI_PERFORMANCE_LABEL || 'current').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, `queue-${label}-${run}.json`), JSON.stringify(metrics, null, 2));
    await info.attach('cola-grande', {
      contentType: 'application/json',
      body: JSON.stringify(metrics),
    });
  });

  test(`rendimiento aislado: perfil nuevo y navegación repetida (${run}/3)`, async ({ harness }, info) => {
    const { electron, page } = harness;
    const trace = info.outputPath('chromium-trace.json');
    const snapshot = () =>
      electron.evaluate(({ app }) => ({
        processes: app.getAppMetrics().map((metric) => ({
          type: metric.type,
          cpuPercent: metric.cpu.percentCPUUsage,
          workingSetKb: metric.memory.workingSetSize,
          privateBytesKb: metric.memory.privateBytes,
        })),
        loop: (
          globalThis as unknown as { __omniHarness: { readLoop(): { p95Ms: number; maxMs: number } } }
        ).__omniHarness.readLoop(),
      }));
    const environment = await electron.evaluate(({ app, BrowserWindow, screen }) => ({
      versions: process.versions,
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      gpu: app.getGPUFeatureStatus(),
      displays: screen
        .getAllDisplays()
        .map((display) => ({ scale: display.scaleFactor, refreshHz: display.displayFrequency })),
      windows: BrowserWindow.getAllWindows().map((window) => window.getBounds()),
    }));
    const before = await snapshot();
    await electron.evaluate(() =>
      (globalThis as unknown as { __omniHarness: { resetLoop(): void } }).__omniHarness.resetLoop(),
    );
    await electron.evaluate(({ contentTracing }) =>
      contentTracing.startRecording({
        included_categories: ['devtools.timeline', 'v8', 'blink', 'electron'],
      }),
    );
    const transitions: Array<{ view: string; elapsedMs: number }> = [];
    try {
      for (let cycle = 0; cycle < 5; cycle++) {
        for (const view of ['Descargas', 'Historial', 'Ajustes'] as MeasuredView[]) {
          const started = performance.now();
          await navigateToMeasuredView(page, view);
          transitions.push({ view, elapsedMs: performance.now() - started });
        }
      }
      const after = await snapshot();
      const values = transitions.map((entry) => entry.elapsedMs).sort((a, b) => a - b);
      await info.attach('rendimiento', {
        contentType: 'application/json',
        body: JSON.stringify(
          {
            scenario: 'offline-empty-library',
            build: 'renderer-production-main-compiled',
            run,
            startupMs: harness.startupMs,
            environment,
            machine: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramBytes: totalmem() },
            display: await page.evaluate(() => ({
              scale: devicePixelRatio,
              width: innerWidth,
              height: innerHeight,
              reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            })),
            transitions,
            medianMs: values[Math.floor(values.length / 2)],
            p95Ms: values[Math.ceil(values.length * 0.95) - 1],
            before,
            after,
          },
          null,
          2,
        ),
      });
      expect(harness.errors).toEqual([]);
      expect(transitions).toHaveLength(15);
    } finally {
      await electron.evaluate(({ contentTracing }, destination) => contentTracing.stopRecording(destination), trace);
      await info.attach('chromium-trace', { path: trace, contentType: 'application/json' });
    }
  });
}

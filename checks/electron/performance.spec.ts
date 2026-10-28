import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { test, expect } from './fixtures';
import { navigateToMeasuredView, type MeasuredView } from './viewReady';

for (let run = 1; run <= 3; run++) {
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

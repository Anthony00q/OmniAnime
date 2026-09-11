import { app } from 'electron';
import { noopScopedLogger, type ScopedLogger } from '../../services/AppLogger';
import { readBootHardwareAcceleration } from '../../services/SettingsManager';

export function setupHardwareAcceleration(options?: { logger?: ScopedLogger }): void {
  const logger = options?.logger ?? noopScopedLogger;
  try {
    const useHardwareAcceleration = readBootHardwareAcceleration();

    if (useHardwareAcceleration) {
      app.commandLine.appendSwitch('ignore-gpu-blocklist');
      app.commandLine.appendSwitch('enable-gpu-rasterization');
      app.commandLine.appendSwitch('enable-oop-rasterization');
      app.commandLine.appendSwitch('enable-zero-copy');
      app.commandLine.appendSwitch('disable-software-rasterizer');
    } else {
      app.disableHardwareAcceleration();
    }
  } catch (e) {
    logger.error(`hardware acceleration: ${e}`);
  }
}
